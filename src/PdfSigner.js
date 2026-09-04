const { useState, useRef, useEffect } = React;

function PdfSigner() {
  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);

  // Modes: 'navigate' or 'sign'
  const [mode, setMode] = useState('navigate');

  // Signature Color State (Default wet-ink blue #002B7F)
  const [penColor, setPenColor] = useState('#002B7F');

  // Session-Saved Signatures Library (Persists across uploaded PDFs)
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [selectedSavedSig, setSelectedSavedSig] = useState(null);

  // Signatures placed on the current PDF document: Array of { id, page, x, y, width, height, dataUrl }
  const [signatures, setSignatures] = useState([]);
  const [selectedSigId, setSelectedSigId] = useState(null);

  // Modal and Drawing state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('saved'); // 'saved' or 'draw'
  const [pendingPos, setPendingPos] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);

  // Undo / Redo history for signatures on current PDF
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // Dragging and Resizing Refs
  const activeActionRef = useRef(null);
  const pdfCanvasRef = useRef(null);

  // Helper to push history
  const updateSignatures = (newSigs) => {
    const nextHistory = history.slice(0, historyStep + 1);
    nextHistory.push(newSigs);
    setHistory(nextHistory);
    setHistoryStep(nextHistory.length - 1);
    setSignatures(newSigs);
  };

  const undo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setSignatures(history[historyStep - 1]);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setSignatures(history[historyStep + 1]);
    }
  };

  // 1. Upload PDF (Keeps savedSignatures intact!)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const fileReader = new FileReader();
      fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);
        setPdfFile(typedarray);
        pdfjsLib.getDocument(typedarray).promise.then((doc) => {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setCurrentPage(1);
          setSignatures([]);
          setHistory([[]]);
          setHistoryStep(0);
        });
      };
      fileReader.readAsArrayBuffer(file);
    }
  };

  // Render PDF page to background canvas
  useEffect(() => {
    if (pdfDoc) {
      pdfDoc.getPage(currentPage).then((page) => {
        const viewport = page.getViewport({ scale: zoom });
        const canvas = pdfCanvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          page.render(renderContext);
        }
      });
    }
  }, [pdfDoc, currentPage, zoom]);

  // Handle clicking on page to add signature
  const handlePageClick = (e) => {
    if (mode !== 'sign' || activeActionRef.current) return;
    const rect = pdfCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setPendingPos({ x, y });
    setActiveTab(savedSignatures.length > 0 ? 'saved' : 'draw');
    setIsModalOpen(true);
  };

  // Drawing Canvas setup
  useEffect(() => {
    if (isModalOpen && activeTab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 500;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = penColor;
    }
  }, [isModalOpen, activeTab, penColor]);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = penColor;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Place signature on PDF
  const placeSignature = (dataUrl) => {
    const defaultW = 150;
    const defaultH = 75;

    const newSig = {
      id: Date.now(),
      page: currentPage,
      x: Math.max(0, pendingPos.x - defaultW / 2),
      y: Math.max(0, pendingPos.y - defaultH / 2),
      width: defaultW,
      height: defaultH,
      dataUrl,
    };

    updateSignatures([...signatures, newSig]);
    setIsModalOpen(false);
  };

  // Save drawn signature to library and place on page
  const handleApplyNewSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');

    // Save to session library if not already present
    if (!savedSignatures.includes(dataUrl)) {
      setSavedSignatures((prev) => [...prev, dataUrl]);
    }

    placeSignature(dataUrl);
  };

  // Place selected existing saved signature
  const handleApplySavedSignature = () => {
    if (selectedSavedSig) {
      placeSignature(selectedSavedSig);
    }
  };

  // Delete saved signature from library
  const deleteSavedSignature = (e, targetSig) => {
    e.stopPropagation();
    setSavedSignatures((prev) => prev.filter((s) => s !== targetSig));
    if (selectedSavedSig === targetSig) {
      setSelectedSavedSig(null);
    }
  };

  // Drag & Resize mouse handlers
  const handleMouseDown = (e, sig, type) => {
    e.stopPropagation();
    setSelectedSigId(sig.id);

    activeActionRef.current = {
      type,
      id: sig.id,
      startX: e.clientX,
      startY: e.clientY,
      sigX: sig.x,
      sigY: sig.y,
      startW: sig.width,
      startH: sig.height,
    };
  };

  const handleMouseMove = (e) => {
    if (!activeActionRef.current) return;
    const action = activeActionRef.current;

    if (action.type === 'move') {
      const dx = (e.clientX - action.startX) / zoom;
      const dy = (e.clientY - action.startY) / zoom;

      setSignatures((prev) =>
        prev.map((s) => (s.id === action.id ? { ...s, x: action.sigX + dx, y: action.sigY + dy } : s))
      );
    } else if (action.type === 'resize') {
      const dx = (e.clientX - action.startX) / zoom;
      const aspectRatio = action.startW / action.startH;
      const newW = Math.max(40, action.startW + dx);
      const newH = newW / aspectRatio;

      setSignatures((prev) =>
        prev.map((s) => (s.id === action.id ? { ...s, width: newW, height: newH } : s))
      );
    }
  };

  const handleMouseUp = () => {
    if (activeActionRef.current) {
      activeActionRef.current = null;
      updateSignatures(signatures);
    }
  };

  // Export Final PDF
  const exportPDF = async () => {
    if (!pdfFile) return;

    const { PDFDocument } = PDFLib;
    const loadedPdf = await PDFDocument.load(pdfFile);
    const pages = loadedPdf.getPages();

    for (const sig of signatures) {
      const targetPage = pages[sig.page - 1];
      const pngImage = await loadedPdf.embedPng(sig.dataUrl);
      const pageHeight = targetPage.getHeight();

      const pdfX = sig.x;
      const pdfY = pageHeight - sig.y - sig.height;

      targetPage.drawImage(pngImage, {
        x: pdfX,
        y: pdfY,
        width: sig.width,
        height: sig.height,
      });
    }

    const pdfBytes = await loadedPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'signed_document.pdf';
    link.click();
  };

  const colorOptions = [
    { label: 'Wet Ink Blue', value: '#002B7F' },
    { label: 'Black', value: '#000000' },
    { label: 'Dark Navy', value: '#0F172A' },
    { label: 'Red', value: '#DC2626' },
  ];

  return (
    <div style={styles.appContainer} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Top Controls Toolbar */}
      <div style={styles.toolbar}>
        <label style={styles.fileLabel}>
          📁 Upload PDF
          <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>

        {pdfDoc && (
          <>
            {/* Mode Switcher */}
            <div style={styles.group}>
              <button
                style={{ ...styles.btn, backgroundColor: mode === 'navigate' ? '#2563EB' : '#E2E8F0', color: mode === 'navigate' ? '#FFF' : '#334155' }}
                onClick={() => setMode('navigate')}
              >
                🖐️ Navigate
              </button>
              <button
                style={{ ...styles.btn, backgroundColor: mode === 'sign' ? '#2563EB' : '#E2E8F0', color: mode === 'sign' ? '#FFF' : '#334155' }}
                onClick={() => setMode('sign')}
              >
                ✍️ Sign
              </button>
            </div>

            {/* Page Navigation */}
            <div style={styles.group}>
              <button style={styles.btn} disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>
                ◀ Prev
              </button>
              <span style={styles.pageIndicator}>
                Page {currentPage} of {numPages}
              </span>
              <button style={styles.btn} disabled={currentPage >= numPages} onClick={() => setCurrentPage(currentPage + 1)}>
                Next ▶
              </button>
            </div>

            {/* Zoom Controls */}
            <div style={styles.group}>
              <button style={styles.btn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>🔍 -</button>
              <span style={styles.pageIndicator}>{Math.round(zoom * 100)}%</span>
              <button style={styles.btn} onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>🔍 +</button>
            </div>

            {/* History Controls */}
            <div style={styles.group}>
              <button style={styles.btn} disabled={historyStep === 0} onClick={undo}>↩ Undo</button>
              <button style={styles.btn} disabled={historyStep === history.length - 1} onClick={redo}>↪ Redo</button>
            </div>

            {/* Export Button */}
            <button style={{ ...styles.btn, backgroundColor: '#059669', color: '#FFF' }} onClick={exportPDF}>
              ⬇ Export PDF
            </button>
          </>
        )}
      </div>

      {/* Main PDF Display */}
      {!pdfDoc ? (
        <div style={styles.emptyState}>
          <h3>No PDF Loaded</h3>
          <p>Click "Upload PDF" above to choose a document from your device.</p>
        </div>
      ) : (
        <div style={styles.pdfViewerContainer}>
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              cursor: mode === 'sign' ? 'crosshair' : 'default',
            }}
            onClick={handlePageClick}
          >
            <canvas ref={pdfCanvasRef} style={{ display: 'block', boxSizing: 'border-box' }} />

            {/* Overlay signatures for CURRENT page */}
            {signatures
              .filter((sig) => sig.page === currentPage)
              .map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    position: 'absolute',
                    left: `${sig.x * zoom}px`,
                    top: `${sig.y * zoom}px`,
                    width: `${sig.width * zoom}px`,
                    height: `${sig.height * zoom}px`,
                    border: selectedSigId === sig.id ? '1.5px dashed #2563EB' : '1px dashed transparent',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    cursor: mode === 'sign' ? 'grab' : 'default',
                  }}
                  onMouseDown={(e) => mode === 'sign' && handleMouseDown(e, sig, 'move')}
                >
                  <img src={sig.dataUrl} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} alt="signature" />
                  {mode === 'sign' && (
                    <div
                      style={styles.resizeHandle}
                      onMouseDown={(e) => handleMouseDown(e, sig, 'resize')}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            {/* Modal Tabs */}
            <div style={styles.tabContainer}>
              <button
                style={{
                  ...styles.tabBtn,
                  borderBottom: activeTab === 'saved' ? '2px solid #2563EB' : '2px solid transparent',
                  color: activeTab === 'saved' ? '#2563EB' : '#64748B',
                }}
                onClick={() => setActiveTab('saved')}
              >
                Saved Signatures ({savedSignatures.length})
              </button>
              <button
                style={{
                  ...styles.tabBtn,
                  borderBottom: activeTab === 'draw' ? '2px solid #2563EB' : '2px solid transparent',
                  color: activeTab === 'draw' ? '#2563EB' : '#64748B',
                }}
                onClick={() => setActiveTab('draw')}
              >
                Draw New
              </button>
            </div>

            {/* Saved Signatures Tab */}
            {activeTab === 'saved' && (
              <div style={styles.savedTabContent}>
                {savedSignatures.length === 0 ? (
                  <p style={{ color: '#64748B', textAlign: 'center', margin: '30px 0' }}>
                    No saved signatures yet. Switch to "Draw New" to create one.
                  </p>
                ) : (
                  <div style={styles.sigGrid}>
                    {savedSignatures.map((sigUrl, index) => (
                      <div
                        key={index}
                        style={{
                          ...styles.sigCard,
                          border: selectedSavedSig === sigUrl ? '2px solid #2563EB' : '1px solid #CBD5E1',
                        }}
                        onClick={() => setSelectedSavedSig(sigUrl)}
                      >
                        <img src={sigUrl} style={{ width: '100%', height: '80px', objectFit: 'contain' }} alt="Saved Signature" />
                        <button
                          style={styles.deleteSigBtn}
                          onClick={(e) => deleteSavedSignature(e, sigUrl)}
                          title="Delete signature"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={styles.modalActions}>
                  <button style={{ ...styles.btn, backgroundColor: '#FEE2E2', color: '#DC2626' }} onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    style={{ ...styles.btn, backgroundColor: selectedSavedSig ? '#2563EB' : '#94A3B8', color: '#FFF' }}
                    disabled={!selectedSavedSig}
                    onClick={handleApplySavedSignature}
                  >
                    Place Signature
                  </button>
                </div>
              </div>
            )}

            {/* Draw New Signature Tab */}
            {activeTab === 'draw' && (
              <div>
                <div style={styles.colorPickerContainer}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>Ink Color:</span>
                  {colorOptions.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setPenColor(c.value)}
                      style={{
                        ...styles.colorCircle,
                        backgroundColor: c.value,
                        outline: penColor === c.value ? '2px solid #2563EB' : 'none',
                        outlineOffset: '2px',
                      }}
                      title={c.label}
                    />
                  ))}
                </div>

                <canvas
                  ref={canvasRef}
                  style={styles.drawCanvas}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />

                <div style={styles.modalActions}>
                  <button style={{ ...styles.btn, backgroundColor: '#E2E8F0' }} onClick={clearCanvas}>
                    Clear
                  </button>
                  <button style={{ ...styles.btn, backgroundColor: '#FEE2E2', color: '#DC2626' }} onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button style={{ ...styles.btn, backgroundColor: '#2563EB', color: '#FFF' }} onClick={handleApplyNewSignature}>
                    Save & Place Signature
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#F8FAFC', userSelect: 'none' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', padding: '10px 16px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  fileLabel: { padding: '8px 14px', backgroundColor: '#2563EB', color: '#FFF', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '10px', borderRight: '1px solid #E2E8F0' },
  btn: { padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#E2E8F0', color: '#334155', fontWeight: 600, cursor: 'pointer' },
  pageIndicator: { fontSize: '14px', fontWeight: 600, color: '#475569', minWidth: '70px', textAlign: 'center' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#64748B' },
  pdfViewerContainer: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '20px', backgroundColor: '#CBD5E1' },
  resizeHandle: { position: 'absolute', right: '-8px', bottom: '-8px', width: '16px', height: '16px', backgroundColor: '#2563EB', border: '2px solid #FFF', borderRadius: '3px', cursor: 'nwse-resize', zIndex: 10 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  modalContent: { backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', width: '520px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  tabContainer: { display: 'flex', gap: '16px', borderBottom: '1px solid #E2E8F0', marginBottom: '16px' },
  tabBtn: { background: 'none', border: 'none', padding: '8px 4px', fontWeight: 600, fontSize: '15px', cursor: 'pointer' },
  savedTabContent: { display: 'flex', flexDirection: 'column', gap: '16px' },
  sigGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', maxHeight: '240px', overflowY: 'auto', padding: '4px' },
  sigCard: { position: 'relative', borderRadius: '8px', padding: '8px', backgroundColor: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  deleteSigBtn: { position: 'absolute', top: '4px', right: '4px', background: '#EF4444', color: '#FFF', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  colorPickerContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  colorCircle: { width: '22px', height: '22px', borderRadius: '50%', border: 'none', cursor: 'pointer' },
  drawCanvas: { border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'crosshair', backgroundColor: '#FAFAFA', touchAction: 'none' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' },
};

window.PdfSigner = PdfSigner;
