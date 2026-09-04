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

  // Signatures saved across all pages: Array of { id, page, x, y, width, height, dataUrl }
  const [signatures, setSignatures] = useState([]);
  const [selectedSigId, setSelectedSigId] = useState(null);

  // Modal and Drawing state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingPos, setPendingPos] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);

  // Undo / Redo history for signatures
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // Dragging and Resizing
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startW: 0, startH: 0, sigX: 0, sigY: 0 });

  const pdfCanvasRef = useRef(null);
  const containerRef = useRef(null);

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

  // 1. Upload PDF
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

  // Handle clicking on page
  const handlePageClick = (e) => {
    if (mode !== 'sign' || isDragging || isResizing) return;
    const rect = pdfCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setPendingPos({ x, y });
    setIsModalOpen(true);
  };

  // Drawing Canvas setup
  useEffect(() => {
    if (isModalOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 500;
      canvas.height = 250;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0F172A';
    }
  }, [isModalOpen]);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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

  // Apply signature to page
  const applySignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');

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

  // Drag & Resize Handlers
  const handleMouseDown = (e, sig, type) => {
    e.stopPropagation();
    setSelectedSigId(sig.id);
    if (type === 'move') {
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        sigX: sig.x,
        sigY: sig.y,
      });
    } else if (type === 'resize') {
      setIsResizing(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        startW: sig.width,
        startH: sig.height,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (!selectedSigId) return;

    if (isDragging) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      const updated = signatures.map((s) =>
        s.id === selectedSigId ? { ...s, x: dragStart.sigX + dx, y: dragStart.sigY + dy } : s
      );
      setSignatures(updated);
    } else if (isResizing) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const aspectRatio = dragStart.startW / dragStart.startH;
      const newW = Math.max(40, dragStart.startW + dx);
      const newH = newW / aspectRatio;

      const updated = signatures.map((s) =>
        s.id === selectedSigId ? { ...s, width: newW, height: newH } : s
      );
      setSignatures(updated);
    }
  };

  const handleMouseUp = () => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(false);
      updateSignatures(signatures);
    }
  };

  // Export Final PDF with all signatures on all pages
  const exportPDF = async () => {
    if (!pdfFile) return;

    const { PDFDocument } = PDFLib;
    const loadedPdf = await PDFDocument.load(pdfFile);
    const pages = loadedPdf.getPages();

    for (const sig of signatures) {
      const targetPage = pages[sig.page - 1];
      const pngImage = await loadedPdf.embedPng(sig.dataUrl);

      const pageHeight = targetPage.getHeight();

      // Convert top-left coordinates to PDF coordinate system (bottom-left origin)
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
                🖐️ Navigate Mode
              </button>
              <button
                style={{ ...styles.btn, backgroundColor: mode === 'sign' ? '#2563EB' : '#E2E8F0', color: mode === 'sign' ? '#FFF' : '#334155' }}
                onClick={() => setMode('sign')}
              >
                ✍️ Sign Mode
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
              ⬇ Export Signed PDF
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
        <div style={styles.pdfViewerContainer} ref={containerRef}>
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
            <h3>Draw Your Signature</h3>
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
              <button style={{ ...styles.btn, backgroundColor: '#E2E8F0' }} onClick={clearCanvas}>Clear</button>
              <button style={{ ...styles.btn, backgroundColor: '#FEE2E2', color: '#DC2626' }} onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button style={{ ...styles.btn, backgroundColor: '#2563EB', color: '#FFF' }} onClick={applySignature}>Apply Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#F8FAFC' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', padding: '12px 20px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  fileLabel: { padding: '8px 14px', backgroundColor: '#2563EB', color: '#FFF', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '12px', borderRight: '1px solid #E2E8F0' },
  btn: { padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#E2E8F0', color: '#334155', fontWeight: 600, cursor: 'pointer' },
  pageIndicator: { fontSize: '14px', fontWeight: 600, color: '#475569', minWidth: '80px', textAlign: 'center' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#64748B' },
  pdfViewerContainer: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '20px', backgroundColor: '#CBD5E1' },
  resizeHandle: { position: 'absolute', right: '-6px', bottom: '-6px', width: '12px', height: '12px', backgroundColor: '#2563EB', borderRadius: '2px', cursor: 'nwse-resize' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  modalContent: { backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  drawCanvas: { border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'crosshair', backgroundColor: '#FAFAFA', touchAction: 'none' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' },
};

window.PdfSigner = PdfSigner;
