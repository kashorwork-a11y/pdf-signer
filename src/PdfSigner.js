import React, { useState, useRef, useEffect } from 'react';

export default function PdfSigner() {
  const [clickPos, setClickPos] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  const [sigTransform, setSigTransform] = useState({
    x: 0,
    y: 0,
    width: 180,
    height: 90,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const pdfRef = useRef(null);

  const handlePdfClick = (e) => {
    if (isDragging || isResizing) return;
    const rect = pdfRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setClickPos({ x, y });
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (isModalOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
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
    const { clientX, clientY } = e.touches ? e.touches[0] : e;
    ctx.beginPath();
    ctx.moveTo(clientX, clientY);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { clientX, clientY } = e.touches ? e.touches[0] : e;
    ctx.lineTo(clientX, clientY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const applySignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    setSignatureData(dataUrl);

    const defaultW = 180;
    const defaultH = 90;
    setSigTransform({
      x: Math.max(0, clickPos.x - defaultW / 2),
      y: Math.max(0, clickPos.y - defaultH / 2),
      width: defaultW,
      height: defaultH,
    });

    setIsModalOpen(false);
  };

  const handleMouseDown = (e, type) => {
    e.stopPropagation();
    if (type === 'move') {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - sigTransform.x,
        y: e.clientY - sigTransform.y,
      });
    } else if (type === 'resize') {
      setIsResizing(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        startWidth: sigTransform.width,
        startHeight: sigTransform.height,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setSigTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    } else if (isResizing) {
      const deltaX = e.clientX - dragStart.x;
      const aspectRatio = dragStart.startWidth / dragStart.startHeight;
      const newWidth = Math.max(50, dragStart.startWidth + deltaX);
      const newHeight = newWidth / aspectRatio;

      setSigTransform((prev) => ({
        ...prev,
        width: newWidth,
        height: newHeight,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  return (
    <div
      style={styles.container}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div ref={pdfRef} style={styles.pdfPage} onClick={handlePdfClick}>
        <div style={styles.pdfContent}>
          <h2>Sample Document Agreement</h2>
          <p>
            Click anywhere on this page to sign. Drag to move, or use the handle to scale.
          </p>
          <div style={styles.signatureLine}>
            <span>Sign Here:</span>
            <div style={{ borderBottom: '2px dashed #94A3B8', width: '200px', height: '24px' }} />
          </div>
        </div>

        {signatureData && (
          <div
            style={{
              ...styles.placedSignatureWrapper,
              left: `${sigTransform.x}px`,
              top: `${sigTransform.y}px`,
              width: `${sigTransform.width}px`,
              height: `${sigTransform.height}px`,
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
          >
            <img
              src={signatureData}
              alt="Signature"
              style={styles.signatureImg}
              draggable={false}
            />
            <div
              style={styles.resizeHandle}
              onMouseDown={(e) => handleMouseDown(e, 'resize')}
            />
          </div>
        )}
      </div>

      {isModalOpen && (
        <div style={styles.fullscreenModal}>
          <div style={styles.toolbar}>
            <span style={{ fontWeight: 600, color: '#334155' }}>Draw Your Signature</span>
            <div>
              <button style={{ ...styles.btn, ...styles.btnClear }} onClick={clearCanvas}>
                Clear
              </button>
              <button style={{ ...styles.btn, ...styles.btnCancel }} onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button style={{ ...styles.btn, ...styles.btnApply }} onClick={applySignature}>
                ✓ Apply Signature
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', padding: '40px 0', backgroundColor: '#F1F5F9', minHeight: '100vh', userSelect: 'none' },
  pdfPage: { position: 'relative', width: '650px', height: '850px', backgroundColor: '#FFFFFF', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', borderRadius: '8px', cursor: 'crosshair', overflow: 'hidden' },
  pdfContent: { padding: '40px', fontFamily: 'sans-serif', color: '#334155' },
  signatureLine: { marginTop: '200px', display: 'flex', alignItems: 'center', gap: '12px' },
  placedSignatureWrapper: { position: 'absolute', border: '1.5px dashed #3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.05)', cursor: 'grab', boxSizing: 'border-box' },
  signatureImg: { width: '100%', height: '100%', pointerEvents: 'none' },
  resizeHandle: { position: 'absolute', right: '-6px', bottom: '-6px', width: '12px', height: '12px', backgroundColor: '#3B82F6', border: '2px solid #FFFFFF', borderRadius: '2px', cursor: 'nwse-resize' },
  fullscreenModal: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 9999, display: 'flex', flexDirection: 'column' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' },
  canvas: { flex: 1, cursor: 'crosshair', touchAction: 'none' },
  btn: { padding: '8px 16px', marginLeft: '8px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer' },
  btnClear: { backgroundColor: '#E2E8F0', color: '#475569' },
  btnCancel: { backgroundColor: '#FEE2E2', color: '#DC2626' },
  btnApply: { backgroundColor: '#2563EB', color: '#FFFFFF' },
};
