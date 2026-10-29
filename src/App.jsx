import { useEffect, useMemo, useRef, useState } from 'react';

const logoPath = `${import.meta.env.BASE_URL}bramhatech-wordmark.png`;
const gridPath = `${import.meta.env.BASE_URL}invoice-grid.png`;
const defaultLayout = { logoSize: 68, textSize: 12, signatureSize: 28, signatureX: 95, signatureY: 78, logoLineGap: 0, invoiceLineGap: 0, topMargin: 8 };
const defaultCompany = { name: 'Bramhatech Lab', owner: 'Saikat Chowdhury', email: '', phone: '', address: '', website: '', upiId: '', logo: logoPath, currency: 'USD', notes: ['Thank you for choosing Bramhatech Lab.'] };
const starterItems = [
  { name: 'AI Strategy & Consultation', price: 250 },
  { name: 'Custom AI Development', price: 1200 },
  { name: 'Website Design & Development', price: 850 },
];
const blankInvoice = (number, currency) => ({
  client: { name: '', email: '', phone: '', address: '', project: '' }, clientId: '',
  number, date: localDate(), due: '', currency, upiEnabled: false,
  items: [{ name: '', quantity: 1, price: 0 }], discount: { type: 'percent', value: 0 }, scheduleEnabled: true,
  milestones: [{ name: 'Project kick-off', percent: 40, due: '' }, { name: 'Work in progress', percent: 30, due: '' }, { name: 'Final delivery', percent: 30, due: '' }],
  note: '', paid: 0,
});
const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
const currencySymbol = (currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(0).find(part => part.type === 'currency')?.value || currency;
const localDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const nextInvoiceNumber = (date, history = [], active = null) => {
  const [year, month, day] = date.split('-');
  const monthYear = `${month}${year.slice(-2)}`;
  const monthCount = history.filter(entry => {
    if (entry.date) return entry.date.slice(5, 7) === month && entry.date.slice(2, 4) === year.slice(-2);
    return /^BL-\d{8}$/.test(entry.number || '') && `${entry.number.slice(3, 5)}${entry.number.slice(7, 9)}` === monthYear;
  }).length;
  const existing = [...history.map(entry => entry.number), active?.number]
    .filter(number => /^BL-\d{8}$/.test(number || '') && `${number.slice(3, 5)}${number.slice(7, 9)}` === monthYear)
    .map(number => Number(number.slice(-2)) || 0);
  const order = String(Math.max(monthCount, 0, ...existing) + 1).padStart(2, '0');
  return `BL-${month}${day}${year.slice(-2)}${order}`;
};
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const trimSignatureCanvas = (source, padding = 16) => {
  const context = source.getContext('2d');
  const pixels = context.getImageData(0, 0, source.width, source.height);
  let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    if (pixels.data[(y * source.width + x) * 4 + 3] > 0) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return '';
  minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding); maxY = Math.min(source.height - 1, maxY + padding);
  const trimmed = document.createElement('canvas');
  trimmed.width = maxX - minX + 1; trimmed.height = maxY - minY + 1;
  trimmed.getContext('2d').drawImage(source, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed.toDataURL('image/png');
};
const trimSignatureData = (dataUrl, padding = 16) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    try { resolve(trimSignatureCanvas(canvas, padding) || dataUrl); } catch (error) { reject(error); }
  };
  image.onerror = reject;
  image.src = dataUrl;
});

export function App() {
  const [page, setPage] = useState('generate');
  const [company, setCompany] = useState(() => {
    const saved = read('bramhatech-company', {});
    const oldLogoPaths = ['./bramhatech-logo.png', '/bramhatech-logo.png', 'bramhatech-logo.png'];
    return { ...defaultCompany, ...saved, logo: saved.logo && !oldLogoPaths.includes(saved.logo) ? saved.logo : logoPath };
  });
  const [layout, setLayout] = useState(() => ({ ...defaultLayout, ...read('bramhatech-layout', {}) }));
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [catalog, setCatalog] = useState(() => read('bramhatech-catalog', starterItems));
  const [clients, setClients] = useState(() => read('bramhatech-clients', []).map((client, i) => ({ ...client, id: client.id || `client-${i}` })));
  const [history, setHistory] = useState(() => read('bramhatech-history', []));
  const [notice, setNotice] = useState('');
  const [invoice, setInvoice] = useState(() => {
    const date = localDate();
    const savedHistory = read('bramhatech-history', []);
    const draft = read('bramhatech-draft', null);
    if (draft) return /^BL-\d{8}$/.test(draft.number || '') ? draft : { ...draft, number: nextInvoiceNumber(draft.date || date, savedHistory) };
    return blankInvoice(nextInvoiceNumber(date, savedHistory), company.currency || 'USD');
  });
  const signatureCanvas = useRef(null);
  const drawingSignature = useRef(false);
  const subtotal = useMemo(() => invoice.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0), [invoice.items]);
  const discountType = invoice.discount?.type || 'percent';
  const discountValue = Math.max(0, Number(invoice.discount?.value) || 0);
  const discountAmount = Math.min(subtotal, discountType === 'percent' ? subtotal * Math.min(discountValue, 100) / 100 : discountValue);
  const totalDue = Math.max(0, subtotal - discountAmount);
  const upiUri = useMemo(() => {
    if (!invoice.upiEnabled || !company.upiId?.trim() || invoice.currency !== 'INR' || totalDue <= 0) return '';
    const params = new URLSearchParams({ pa: company.upiId.trim(), pn: company.name || 'Bramhatech Lab', am: totalDue.toFixed(2), cu: 'INR', tn: `Invoice ${invoice.number}` });
    return `upi://pay?${params.toString()}`;
  }, [invoice.upiEnabled, invoice.currency, invoice.number, company.upiId, company.name, totalDue]);
  const [upiQr, setUpiQr] = useState('');
  const scheduledPercent = invoice.milestones.reduce((sum, milestone) => sum + (Number(milestone.percent) || 0), 0);
  const monthlyRevenue = useMemo(() => {
    const month = localDate().slice(0, 7), totals = {};
    history.filter(item => item.status === 'Generated' && (item.date || '').slice(0, 7) === month).forEach(item => {
      const currency = item.currency || company.currency || 'USD'; totals[currency] = (totals[currency] || 0) + (Number(item.total) || 0);
    });
    if (!Object.keys(totals).length) totals[company.currency || 'USD'] = 0;
    return totals;
  }, [history, company.currency]);

  useEffect(() => {
    let cancelled = false;
    if (!upiUri) { setUpiQr(''); return () => { cancelled = true; }; }
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(upiUri, { width: 240, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#211e1c', light: '#00000000' } })).then(data => { if (!cancelled) setUpiQr(data); }).catch(() => { if (!cancelled) setUpiQr(''); });
    return () => { cancelled = true; };
  }, [upiUri]);

  useEffect(() => localStorage.setItem('bramhatech-company', JSON.stringify(company)), [company]);
  useEffect(() => localStorage.setItem('bramhatech-catalog', JSON.stringify(catalog)), [catalog]);
  useEffect(() => localStorage.setItem('bramhatech-clients', JSON.stringify(clients)), [clients]);
  useEffect(() => localStorage.setItem('bramhatech-history', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('bramhatech-draft', JSON.stringify(invoice)), [invoice]);
  useEffect(() => {
    const canvas = signatureCanvas.current;
    if (page !== 'admin' || !canvas || !company.signature) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min((canvas.width - 36) / image.width, (canvas.height - 36) / image.height);
      const width = image.width * scale, height = image.height * scale;
      context?.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    };
    image.src = company.signature;
  }, [page, company.signature]);

  const updateInvoice = (patch) => setInvoice(current => ({ ...current, ...patch }));
  const updateLayout = (patch) => { setLayout(current => ({ ...current, ...patch })); setLayoutDirty(true); };
  const saveLayout = () => {
    localStorage.setItem('bramhatech-layout', JSON.stringify(layout));
    setLayoutDirty(false);
    setNotice('Invoice layout saved for future PDFs.');
    window.setTimeout(() => setNotice(''), 4000);
  };
  const updateClient = (key, value) => setInvoice(current => ({ ...current, clientId: '', client: { ...current.client, [key]: value } }));
  const chooseClient = (id) => {
    const selected = clients.find(client => client.id === id);
    if (selected) setInvoice(current => ({ ...current, clientId: selected.id, client: { name: selected.name || '', contact: selected.contact || '', email: selected.email || '', phone: selected.phone || '', address: selected.address || '', project: '' } }));
    else setInvoice(current => ({ ...current, clientId: '' }));
  };
  const updateItem = (index, key, value) => setInvoice(current => ({ ...current, items: current.items.map((item, i) => {
    if (i !== index) return item;
    const selectedProduct = key === 'name' ? catalog.find(product => product.name.trim().toLowerCase() === String(value).trim().toLowerCase()) : null;
    return { ...item, [key]: value, ...(selectedProduct ? { price: selectedProduct.price } : {}) };
  }) }));
  const addItem = (name = '', price = 0) => setInvoice(current => ({ ...current, items: [...current.items, { name, quantity: 1, price }] }));
  const updateMilestone = (index, key, value) => setInvoice(current => ({ ...current, milestones: current.milestones.map((milestone, i) => i === index ? { ...milestone, [key]: value } : milestone) }));
  const rememberInvoiceDetails = () => {
    const clientKey = invoice.client.email.trim().toLowerCase() || invoice.client.name.trim().toLowerCase();
    if (clientKey) setClients(current => {
      const index = current.findIndex(client => (client.email || client.name).trim().toLowerCase() === clientKey);
      const existing = index >= 0 ? current[index] : null;
      const updated = { ...invoice.client, id: existing?.id || `client-${clientKey}`, lastInvoice: invoice.number };
      return index >= 0 ? current.map((client, i) => i === index ? updated : client) : [updated, ...current];
    });
    const namedItems = invoice.items.filter(item => item.name.trim());
    if (namedItems.length) setCatalog(current => namedItems.reduce((items, item) => {
      const index = items.findIndex(product => product.name.trim().toLowerCase() === item.name.trim().toLowerCase());
      const product = { name: item.name.trim(), price: Number(item.price) || 0 };
      return index >= 0 ? items.map((entry, i) => i === index ? product : entry) : [product, ...items];
    }, current));
  };
  const rememberInHistory = (status) => {
    const saved = { ...invoice, company: { ...company }, total: totalDue, created: new Date().toISOString(), status };
    setHistory(current => [saved, ...current.filter(item => item.number !== saved.number)]);
  };
  const deleteHistoryInvoice = (item) => {
    if (!window.confirm(`Delete invoice ${item.number} from history? This cannot be undone.`)) return;
    setHistory(current => current.filter(entry => entry.number !== item.number));
  };
  const exportHistoryToExcel = async () => {
    if (!history.length) return;
    const XLSX = await import('xlsx'), workbook = XLSX.utils.book_new();
    const invoices = history.map(item => ({ 'Invoice number': item.number, Client: item.client?.name || '', Email: item.client?.email || '', Phone: item.client?.phone || '', Address: item.client?.address || '', Project: item.client?.project || '', 'Issue date': item.date || '', 'Due date': item.due || '', 'Currency symbol': currencySymbol(item.currency || 'USD'), 'Total due': Number(item.total) || 0, Status: item.status || 'Draft' }));
    const lines = history.flatMap(item => (item.items || []).map(line => ({ 'Invoice number': item.number, Client: item.client?.name || '', Description: line.name || '', Quantity: Number(line.quantity) || 0, 'Unit price': Number(line.price) || 0, 'Line total': (Number(line.quantity) || 0) * (Number(line.price) || 0), 'Currency symbol': currencySymbol(item.currency || 'USD') })));
    const payments = history.flatMap(item => (item.scheduleEnabled ? item.milestones || [] : []).map(milestone => ({ 'Invoice number': item.number, Client: item.client?.name || '', Milestone: milestone.name || '', 'Percent due': Number(milestone.percent) || 0, 'Due date': milestone.due || '', Amount: (Number(item.total) || 0) * (Number(milestone.percent) || 0) / 100, 'Currency symbol': currencySymbol(item.currency || 'USD') })));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(invoices), 'Invoices');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lines), 'Line items');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payments), 'Payment schedule');
    XLSX.writeFile(workbook, 'bramhatech-invoice-history.xlsx');
  };
  const saveInvoice = () => {
    if (!invoice.client.name.trim()) { window.alert('Add a client name before saving this invoice.'); return; }
    rememberInvoiceDetails(); rememberInHistory('Draft'); setNotice('Draft saved. Client and products added to your lists.');
    window.setTimeout(() => setNotice(''), 4500);
  };
  const startNewInvoice = () => {
    const date = localDate();
    setInvoice(blankInvoice(nextInvoiceNumber(date, history, invoice), company.currency));
    setPage('generate');
  };
  const addClientToInvoice = (client) => {
    setInvoice(current => ({ ...current, clientId: client.id, client: { name: client.name || '', contact: client.contact || '', email: client.email || '', phone: client.phone || '', address: client.address || '', project: '' } }));
    setPage('generate');
  };
  const startSignature = (event) => {
    const canvas = signatureCanvas.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const context = canvas.getContext('2d');
    context.strokeStyle = '#26231f'; context.lineWidth = 2.7; context.lineCap = 'round'; context.lineJoin = 'round';
    context.beginPath(); context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    drawingSignature.current = true; canvas.setPointerCapture(event.pointerId);
  };
  const drawSignature = (event) => {
    if (!drawingSignature.current || !signatureCanvas.current) return;
    const canvas = signatureCanvas.current; const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d'); context.lineTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height); context.stroke();
  };
  const finishSignature = () => {
    if (!drawingSignature.current || !signatureCanvas.current) return;
    drawingSignature.current = false;
    const signature = trimSignatureCanvas(signatureCanvas.current);
    if (signature) setCompany(current => ({ ...current, signature }));
  };
  const clearSignature = () => { const canvas = signatureCanvas.current; canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setCompany(current => ({ ...current, signature: '' })); };
  const exportPdf = async () => {
    if (!invoice.client.name.trim()) { window.alert('Add a client name before downloading the invoice.'); return; }
    setNotice('Preparing your PDF…');
    try {
    const signatureData = company.signature ? await trimSignatureData(company.signature) : '';
    const qrData = upiUri ? await (await import('qrcode')).default.toDataURL(upiUri, { width: 320, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#211e1c', light: '#00000000' } }) : '';
    const bodyFont = Math.max(10, Math.min(20, Number(layout.textSize) || 12));
    const fontFactor = bodyFont / 12;
    const scaleFont = (size) => size * fontFactor;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 18, right = 192, content = right - left;
    const pageMargin = Math.max(0, Math.min(25, Number(layout.topMargin ?? 8)));
    const pageBottom = 297 - pageMargin;
    let y = pageMargin;
    let pageNumber = 1;
    let gridData = '';
    const paintGrid = () => { if (gridData) doc.addImage(gridData, 'PNG', 0, 0, 210, 297); };
    const nextPage = () => { doc.addPage(); pageNumber += 1; paintGrid(); y = pageMargin; };
    const ensureRoom = (height, top = pageMargin) => { if (y + height > pageBottom) { nextPage(); y = top; } };
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(235, 228, 221);
    doc.setTextColor(42, 37, 33);
    try {
      const response = await fetch(gridPath);
      const blob = await response.blob();
      gridData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      paintGrid();
    } catch { /* use a clean white page if the subtle grid cannot be loaded */ }
    let logoHeight = 26;
    try {
      const response = await fetch(company.logo || logoPath);
      const blob = await response.blob();
      const logoSource = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      const logo = await trimSignatureData(logoSource, 0);
      const logoSize = doc.getImageProperties(logo);
      const logoWidth = Math.max(40, Math.min(95, Number(layout.logoSize) || 68));
      logoHeight = logoWidth * logoSize.height / logoSize.width;
      doc.addImage(logo, logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', left, y, logoWidth, logoHeight);
    } catch { /* keep the invoice readable if a custom logo cannot be loaded */ }
    const headerFontFactor = Math.min(fontFactor, Math.max(0.6, (logoHeight - 2.5) / (43 * 0.3528)));
    const invoiceTitleHeight = 27 * headerFontFactor * 0.3528;
    const invoiceIdHeight = 16 * headerFontFactor * 0.3528;
    const headerHeight = logoHeight;
    const invoiceTitleOffset = headerHeight - invoiceTitleHeight - 2 - invoiceIdHeight + Math.max(-15, Math.min(15, Number(layout.invoiceLineGap) || 0));
    doc.setTextColor(42, 37, 33); doc.setFont('helvetica', 'bold'); doc.setFontSize(27 * headerFontFactor); doc.text('INVOICE', right, y + invoiceTitleOffset + invoiceTitleHeight, { align: 'right' });
    doc.setFontSize(16 * headerFontFactor); doc.text(`# ${invoice.number}`, right, y + invoiceTitleOffset + invoiceTitleHeight + 2 + invoiceIdHeight, { align: 'right' });
    y += headerHeight;
    y += Math.max(0, Math.min(15, Number(layout.logoLineGap) || 0));
    doc.setDrawColor(245, 160, 25); doc.setLineWidth(0.7); doc.line(left, y, right, y); y += 8;
    doc.setTextColor(150, 137, 125); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(10)); doc.text('FROM', left, y);
    doc.text('ISSUED ON', right - 65, y); doc.text('DUE DATE', right - 29, y);
    y += 7 * fontFactor; doc.setTextColor(48, 42, 37); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(12)); doc.text(company.name || 'Bramhatech Lab', left, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(11)); doc.text(formatDate(invoice.date), right - 65, y); doc.text(invoice.due ? formatDate(invoice.due) : 'Upon receipt', right - 29, y);
    y += 7 * fontFactor; doc.setTextColor(117, 107, 98); doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(10));
    const companyLines = [company.owner, company.address, company.email, company.phone, company.website].filter(Boolean).flatMap(line => doc.splitTextToSize(line, 92));
    companyLines.forEach(line => { ensureRoom(scaleFont(10) * 0.55 + 2); doc.setFontSize(scaleFont(10)); doc.text(line, left, y); y += 5.5 * fontFactor; });
    let billY = Math.max(y + 8 * fontFactor, 82);
    if (billY + 30 * fontFactor > pageBottom) { nextPage(); billY = pageMargin; }
    doc.setTextColor(150, 137, 125); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(10)); doc.text('BILLED TO', left, billY);
    doc.setTextColor(48, 42, 37); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(16)); doc.text(invoice.client.name, left, billY + 8 * fontFactor);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(12)); doc.setTextColor(117, 107, 98);
    const clientLines = [invoice.client.contact, invoice.client.address, invoice.client.email, invoice.client.phone].filter(Boolean).flatMap(line => doc.splitTextToSize(line, 92));
    let clientY = billY + 15 * fontFactor; clientLines.forEach(line => { if (clientY + 6 * fontFactor > pageBottom) { nextPage(); clientY = pageMargin + 8; doc.setTextColor(150, 137, 125); doc.setFontSize(scaleFont(10)); doc.text('BILLED TO · CONTINUED', left, pageMargin); } doc.text(line, left, clientY); clientY += 6 * fontFactor; });
    y = clientY + 14 * fontFactor;
    if (invoice.client.project?.trim()) {
      ensureRoom(14 * fontFactor);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 137, 125); doc.setFontSize(scaleFont(10)); doc.text('PROJECT / REFERENCE', left, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(78, 70, 63); doc.setFontSize(scaleFont(11));
      const projectLines = doc.splitTextToSize(invoice.client.project, content - 45);
      projectLines.forEach((line, index) => { if (index > 0 && y + 6 * fontFactor > pageBottom) { nextPage(); } doc.text(line, left + 45, y); y += 6 * fontFactor; });
      y += 8 * fontFactor;
    }
    const tableHeaderHeight = 10 * fontFactor + 2;
    const drawItemHeader = () => {
      ensureRoom(tableHeaderHeight + 16 * fontFactor);
      doc.setFillColor(255, 241, 213); doc.rect(left, y - 6, content, tableHeaderHeight, 'F');
      doc.setTextColor(140, 128, 118); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(11));
      doc.text('DESCRIPTION', left + 2, y); doc.text('QTY', 124, y, { align: 'right' }); doc.text('RATE', 157, y, { align: 'right' }); doc.text('AMOUNT', right - 2, y, { align: 'right' });
      y += tableHeaderHeight + 2;
    };
    drawItemHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(12)); doc.setTextColor(65, 58, 52);
    for (const item of invoice.items.filter(row => row.name || Number(row.price))) {
      const nameLines = doc.splitTextToSize(item.name || 'Service item', 94);
      const rowHeight = Math.max(13 * fontFactor, nameLines.length * 6 * fontFactor + 4 * fontFactor);
      const pageBeforeRow = pageNumber;
      ensureRoom(rowHeight + 3);
      if (pageNumber !== pageBeforeRow) { drawItemHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(12)); doc.setTextColor(65, 58, 52); }
      doc.text(nameLines, left + 2, y); doc.text(String(item.quantity || 0), 124, y, { align: 'right' });
      drawPdfMoney(doc, item.price, invoice.currency, 157, y);
      drawPdfMoney(doc, (Number(item.quantity) || 0) * (Number(item.price) || 0), invoice.currency, right - 2, y);
      y += rowHeight; doc.setDrawColor(239, 235, 231); doc.setLineWidth(0.2); doc.line(left, y - 2, right, y - 2);
    }
    y += 8 * fontFactor; ensureRoom((discountAmount > 0 ? 57 : 49) * fontFactor);
    doc.setTextColor(116, 106, 97); doc.setFontSize(scaleFont(12)); doc.text('Subtotal', 145, y, { align: 'right' }); drawPdfMoney(doc, subtotal, invoice.currency, right - 2, y);
    if (discountAmount > 0) { y += 8 * fontFactor; doc.setTextColor(116, 106, 97); doc.setFontSize(scaleFont(12)); doc.text(discountType === 'percent' ? `Discount (${Math.min(discountValue, 100)}%)` : 'Discount', 145, y, { align: 'right' }); drawPdfMoney(doc, discountAmount, invoice.currency, right - 2, y, true, '-'); }
    y += 8 * fontFactor; doc.text('Tax', 145, y, { align: 'right' }); drawPdfMoney(doc, 0, invoice.currency, right - 2, y);
    y += 7 * fontFactor; const totalBandHeight = 19 * fontFactor; doc.setFillColor(255, 241, 213); doc.roundedRect(112, y - 2 * fontFactor, 80, totalBandHeight, 1.5, 1.5, 'F');
    doc.setTextColor(48, 42, 37); doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(12)); doc.text('TOTAL DUE', 118, y + 10 * fontFactor); doc.setFontSize(scaleFont(17)); drawPdfMoney(doc, totalDue, invoice.currency, right - 4, y + 10 * fontFactor, true);
    y += 28 * fontFactor;
    ensureRoom(Math.max(20 * fontFactor, qrData ? 40 : 0));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(10)); doc.setTextColor(150, 137, 125); doc.text(invoice.scheduleEnabled ? 'PAYMENT SCHEDULE' : 'PAYMENT TERMS', left, y); y += 9 * fontFactor;
    let qrCardBottom = y;
    if (qrData) {
      const cardWidth = 56, cardHeight = 34, cardX = right - cardWidth, cardY = y - 6;
      doc.setFillColor(255, 250, 240); doc.setDrawColor(239, 220, 185); doc.setLineWidth(0.35); doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2.5, 2.5, 'FD');
      doc.addImage(qrData, 'PNG', cardX + 3, cardY + 5, 23, 23);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(10)); doc.setTextColor(57, 50, 44); doc.text('SCAN & PAY', cardX + 29, cardY + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(8)); drawPdfMoney(doc, totalDue, 'INR', cardX + 29, cardY + 24, false, '', 'left');
      qrCardBottom = cardY + cardHeight + 4;
    }
    if (invoice.scheduleEnabled) {
      const timelineX = left + 3, milestoneTextX = left + 12, milestoneAmountX = milestoneTextX + 78;
      for (let index = 0; index < invoice.milestones.length; index += 1) {
        const milestone = invoice.milestones[index];
        const milestoneNameLines = doc.splitTextToSize(milestone.name || `Milestone ${index + 1}`, 72);
        const milestoneRowHeight = Math.max(14 * fontFactor, milestoneNameLines.length * 6 * fontFactor + 8 * fontFactor);
        ensureRoom(milestoneRowHeight + 2);
        const nextMilestone = invoice.milestones[index + 1];
        const nextMilestoneLines = nextMilestone ? doc.splitTextToSize(nextMilestone.name || `Milestone ${index + 2}`, 72) : [];
        const nextMilestoneHeight = nextMilestone ? Math.max(14 * fontFactor, nextMilestoneLines.length * 6 * fontFactor + 8 * fontFactor) : 0;
        const nextRowFits = !!nextMilestone && y + milestoneRowHeight + nextMilestoneHeight + 2 <= pageBottom;
        if (nextRowFits) { doc.setDrawColor(232, 190, 157); doc.setLineWidth(0.7); doc.line(timelineX, y - 1, timelineX, y + milestoneRowHeight - 1); }
        doc.setFillColor(milestone.paid ? 236 : 250, milestone.paid ? 245 : 235, milestone.paid ? 238 : 226); doc.circle(timelineX, y - 1, 2.7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setTextColor(159, 91, 40); doc.setFontSize(scaleFont(8)); doc.text(String(index + 1), timelineX, y + 0.2, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(57, 50, 44); doc.setFontSize(scaleFont(12)); doc.text(milestoneNameLines, milestoneTextX, y);
        doc.setTextColor(57, 50, 44); doc.setFontSize(scaleFont(12)); drawPdfMoney(doc, totalDue * (Number(milestone.percent) || 0) / 100, invoice.currency, milestoneAmountX, y, false, '', 'left');
        const milestoneDetail = milestone.paid ? 'Payment received' : `${milestone.percent}% due${milestone.due ? ` · ${formatDate(milestone.due)}` : ''}`;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 120, 111); doc.setFontSize(scaleFont(10)); doc.text(milestoneDetail, milestoneTextX, y + milestoneNameLines.length * 6 * fontFactor);
        y += milestoneRowHeight;
      }
    } else { doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(12)); doc.setTextColor(78, 70, 63); const prefix = 'Prepaid in full - '; doc.text(prefix, left, y); drawPdfMoney(doc, totalDue, invoice.currency, left + doc.getTextWidth(prefix), y, false, '', 'left'); y += 10 * fontFactor; }
    if (qrData) y = Math.max(y, qrCardBottom);
    if (invoice.note) {
      y += 5 * fontFactor; ensureRoom((scaleFont(10) + 12) * 0.6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(10)); doc.setTextColor(150, 137, 125); doc.text('NOTE', left, y); y += 7;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(12)); doc.setTextColor(78, 70, 63);
      const noteLines = doc.splitTextToSize(invoice.note, content); const noteLineHeight = 6 * fontFactor;
      for (let index = 0; index < noteLines.length;) {
        ensureRoom(noteLineHeight);
        const fit = Math.max(1, Math.floor((pageBottom - y) / noteLineHeight));
        const lines = noteLines.slice(index, index + fit); doc.text(lines, left, y); y += lines.length * noteLineHeight; index += lines.length;
        if (index < noteLines.length) nextPage();
      }
      y += 8 * fontFactor;
    }
    if (signatureData) {
      const signatureSize = doc.getImageProperties(signatureData);
      const signatureScale = (Number(layout.signatureSize) || 28) / signatureSize.width;
      const signatureWidth = signatureSize.width * signatureScale;
      const signatureHeight = signatureSize.height * signatureScale;
      const signatureRight = left + content * Math.max(65, Math.min(98, Number(layout.signatureX) || 95)) / 100;
      const preferredSignatureTop = 297 * Math.max(55, Math.min(85, Number(layout.signatureY) || 78)) / 100;
      const signatureGap = 3 * fontFactor;
      const nameLineSpace = 5 * fontFactor;
      const signatureTail = signatureGap + nameLineSpace + 2;
      let minimumSignatureTop = y + signatureGap;
      let maximumSignatureTop = pageBottom - signatureHeight - signatureTail;
      const singlePageLayout = pageNumber === 1;
      let desiredSignatureTop = singlePageLayout ? Math.max(minimumSignatureTop, preferredSignatureTop) : minimumSignatureTop;
      if (desiredSignatureTop > maximumSignatureTop && minimumSignatureTop <= maximumSignatureTop) desiredSignatureTop = maximumSignatureTop;
      if (minimumSignatureTop > maximumSignatureTop) { nextPage(); minimumSignatureTop = y + signatureGap; maximumSignatureTop = pageBottom - signatureHeight - signatureTail; desiredSignatureTop = minimumSignatureTop; }
      const finalSignatureTop = Math.max(minimumSignatureTop, Math.min(desiredSignatureTop, maximumSignatureTop));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(11));
      const ownerWidth = doc.getTextWidth(company.owner || '');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(9));
      const companyWidth = company.name ? doc.getTextWidth(company.name) : 0;
      const signatureBlockWidth = Math.max(signatureWidth, ownerWidth, companyWidth);
      const signatureLeft = signatureRight - signatureBlockWidth;
      doc.addImage(signatureData, 'PNG', signatureLeft, finalSignatureTop, signatureWidth, signatureHeight);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(scaleFont(11)); doc.setTextColor(57, 50, 44); doc.text(company.owner || '', signatureLeft, finalSignatureTop + signatureHeight + 4 * fontFactor);
      if (company.name) { doc.setFont('helvetica', 'normal'); doc.setFontSize(scaleFont(9)); doc.setTextColor(117, 107, 98); doc.text(company.name, signatureLeft + ownerWidth / 2, finalSignatureTop + signatureHeight + 4 * fontFactor + nameLineSpace, { align: 'center' }); }
    }
    doc.save(`${(invoice.number || 'invoice').replace(/[^a-z0-9-_]/gi, '-')}.pdf`);
    rememberInvoiceDetails(); rememberInHistory('Generated');
    setNotice('Your invoice PDF has downloaded.');
    window.setTimeout(() => setNotice(''), 5000);
    } catch {
      setNotice('Could not create the PDF. Please try again.');
      window.setTimeout(() => setNotice(''), 5000);
    }
  };

  const nav = [
    ['generate', 'Generate Invoice'], ['history', 'Invoice History'], ['products', 'Products'], ['clients', 'Clients'], ['admin', 'Admin Panel'],
  ];
  const pageTitle = { generate: 'Create an invoice', history: 'Invoice history', products: 'Products', clients: 'Clients', admin: 'Company settings' }[page];

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => setPage('generate')} aria-label="Bramhatech Lab home">
        <img src={company.logo || logoPath} alt="Bramhatech Lab logo" />
      </button>
      <nav aria-label="Main navigation">
        <p className="nav-label">WORKSPACE</p>
        {nav.map(([id, label]) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><span className="nav-mark" />{label}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="user-avatar">SC</div><div><strong>{company.owner || 'Saikat Chowdhury'}</strong><span>Workspace owner</span></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">BRAMHATECH LAB <i>•</i> INVOICING</span><div className="topbar-title">{pageTitle}</div></div><div className="topbar-right"><span className="secure-dot" />Saved in this browser<button className="header-new" onClick={startNewInvoice}>＋ New invoice</button></div></header>
      {page === 'generate' && <section className="workspace">
        <div className="editor-column">
          <div className="section-heading"><div><span className="step">01</span><h2>Client details</h2></div><span className="section-caption">Who is this invoice for?</span></div>
          <div className="field-grid client-fields">
            <label className="field span-two"><span>Choose a saved client</span><select value={invoice.clientId || ''} onChange={e => chooseClient(e.target.value)}><option value="">New client — enter details below</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}{client.email ? ` · ${client.email}` : ''}</option>)}</select></label>
            <Field label="Client name" value={invoice.client.name} onChange={e => updateClient('name', e.target.value)} placeholder="e.g. Maple & Co." required />
            <Field label="Contact person" value={invoice.client.contact || ''} onChange={e => updateClient('contact', e.target.value)} placeholder="Full name" />
            <Field label="Email address" value={invoice.client.email} onChange={e => updateClient('email', e.target.value)} placeholder="name@company.com" type="email" />
            <Field label="Phone number" value={invoice.client.phone} onChange={e => updateClient('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
            <label className="field span-two"><span>Billing address</span><textarea value={invoice.client.address} onChange={e => updateClient('address', e.target.value)} placeholder="Street, city, region, postal code" rows="2" /></label>
            <Field label="Project / reference" value={invoice.client.project} onChange={e => updateClient('project', e.target.value)} placeholder="Optional" />
            <Field label="Invoice number" value={invoice.number} onChange={e => updateInvoice({ number: e.target.value })} />
            <Field label="Issue date" type="date" value={invoice.date} onChange={e => updateInvoice({ date: e.target.value })} />
            <Field label="Due date" type="date" value={invoice.due} onChange={e => updateInvoice({ due: e.target.value })} />
          </div>

          <div className="section-heading items-heading"><div><span className="step">02</span><h2>Invoice items</h2></div><span className="section-caption">Services, hours or products</span></div>
          <div className="items-table">
            <div className="items-header"><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span><span /></div>
            {invoice.items.map((item, index) => <div className="item-row" key={index}>
              <input aria-label="Item description" value={item.name} list="service-list" onChange={e => updateItem(index, 'name', e.target.value)} placeholder="Add a service or product" />
              <input aria-label="Quantity" type="number" min="0" step="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} />
              <input aria-label="Unit price" type="number" min="0" step="0.01" value={item.price} onChange={e => updateItem(index, 'price', e.target.value)} />
              <strong>{money((Number(item.quantity) || 0) * (Number(item.price) || 0), invoice.currency)}</strong>
              <button className="remove" onClick={() => setInvoice(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} aria-label="Remove item">×</button>
            </div>)}
            <datalist id="service-list">{catalog.map((item, i) => <option key={i} value={item.name} />)}</datalist>
          </div>
          <div className="item-actions"><button className="text-action" onClick={() => addItem()}>＋ Add item</button><select className="library-select" aria-label="Add a saved product" value="" onChange={e => { const selected = catalog[Number(e.target.value)]; if (selected) addItem(selected.name, selected.price); }}><option value="">Add saved product</option>{catalog.map((item, index) => <option key={index} value={index}>{item.name} · {money(item.price, invoice.currency)}</option>)}</select></div>
          <div className="discount-controls"><label className="field"><span>Discount type</span><select value={discountType} onChange={e => updateInvoice({ discount: { type: e.target.value, value: invoice.discount?.value || 0 } })}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label><label className="field"><span>Discount {discountType === 'percent' ? '(%)' : `(${invoice.currency})`}</span><input type="number" min="0" max={discountType === 'percent' ? 100 : subtotal} step={discountType === 'percent' ? 1 : 0.01} value={invoice.discount?.value ?? 0} onChange={e => updateInvoice({ discount: { type: discountType, value: e.target.value } })}/></label><span className="discount-result">{discountAmount > 0 ? `−${money(discountAmount, invoice.currency)}` : 'Optional'}</span></div>

          <div className="section-heading schedule-heading"><div><span className="step">03</span><h2>Payment schedule</h2></div><label className="toggle-label"><span>{invoice.scheduleEnabled ? 'Installments' : 'Prepaid invoice'}</span><input type="checkbox" checked={invoice.scheduleEnabled} onChange={e => updateInvoice({ scheduleEnabled: e.target.checked })} /><i className="toggle" /></label></div>
          <div className="upi-option"><label><input type="checkbox" checked={!!invoice.upiEnabled} onChange={e => updateInvoice({ upiEnabled: e.target.checked })}/><span>Accept payment via UPI</span></label><small>QR code uses the total due after discount.</small></div>
          {invoice.upiEnabled && (!company.upiId?.trim() || invoice.currency !== 'INR') && <p className="upi-warning">{!company.upiId?.trim() ? 'Add your UPI ID in Admin Panel to create a payment QR.' : 'UPI QR payments require the invoice currency to be INR.'}</p>}
          {invoice.scheduleEnabled ? <div className="schedule-content">
            <div className="schedule-intro">Split the total into milestones. Each amount updates with your invoice total.</div>
            {invoice.milestones.map((milestone, index) => <div className="milestone-row" key={index}><span className="milestone-index">{String(index + 1).padStart(2, '0')}</span><input aria-label="Milestone name" value={milestone.name} onChange={e => updateMilestone(index, 'name', e.target.value)} /><input aria-label="Milestone percentage" className="percent-input" type="number" min="0" max="100" value={milestone.percent} onChange={e => updateMilestone(index, 'percent', e.target.value)} /><strong>{money(totalDue * (Number(milestone.percent) || 0) / 100, invoice.currency)}</strong><input aria-label="Milestone due date" type="date" value={milestone.due} onChange={e => updateMilestone(index, 'due', e.target.value)} /><label className="milestone-paid" title="Mark payment received"><input type="checkbox" checked={!!milestone.paid} onChange={e => updateMilestone(index, 'paid', e.target.checked)} /><span>Paid</span></label><button className="remove" onClick={() => updateInvoice({ milestones: invoice.milestones.filter((_, i) => i !== index) })} aria-label="Remove milestone">×</button></div>)}
            <div className="schedule-footer"><button className="text-action" onClick={() => updateInvoice({ milestones: [...invoice.milestones, { name: 'New milestone', percent: 0, due: '' }] })}>＋ Add milestone</button><span className={scheduledPercent === 100 ? 'balanced' : 'unbalanced'}>{scheduledPercent}% allocated {scheduledPercent === 100 ? '✓' : '— should equal 100%'}</span></div>
          </div> : <div className="prepaid-note"><span className="prepaid-mark">✓</span><div><strong>Paid in full upfront</strong><p>This invoice will be shown as prepaid, with no installment schedule.</p></div></div>}

          <div className="section-heading notes-heading"><div><span className="step">04</span><h2>Notes & terms</h2></div><span className="section-caption">Add a return, refund or project note</span></div>
          <label className="field notes-field"><span>Custom note</span><textarea value={invoice.note} onChange={e => updateInvoice({ note: e.target.value })} placeholder="e.g. Refunds are available within 14 days of delivery." rows="3" /></label>
          {company.notes?.length > 0 && <div className="saved-notes"><span>Saved notes</span>{company.notes.map((note, i) => <button key={i} onClick={() => updateInvoice({ note })}>{note}</button>)}</div>}
          <div className="editor-footer"><button className="button-secondary" onClick={saveInvoice}>Save draft</button><div className="footer-total"><span>Invoice total</span><strong>{money(totalDue, invoice.currency)}</strong></div><button className="button-primary" onClick={exportPdf}>Download PDF <span>↗</span></button></div>
        </div>

        <aside className="preview-column">
          <div className="preview-heading"><div><span className="preview-dot" />LIVE PREVIEW</div><button onClick={() => window.print()}>Print view</button></div>
          <article className="invoice-paper" style={{ backgroundImage: `url("${gridPath}")`, '--invoice-text-scale': Math.max(10, Math.min(20, Number(layout.textSize) || 12)) / 12, '--invoice-page-margin': `${Math.max(0, Math.min(25, Number(layout.topMargin ?? 8)))}mm`, '--signature-x': `${layout.signatureX}%` }}>
            <div className="invoice-top"><div className="invoice-brand"><img src={company.logo || logoPath} alt={company.name} style={{ width: `${Number(layout.logoSize || 68) * 2.35}px`, height: 'auto', maxWidth: '100%' }} /></div><div className="invoice-word">INVOICE<span># {invoice.number}</span></div></div>
            <div className="invoice-company-block"><div><strong>{company.name}</strong>{company.address && <span>{company.address}</span>}{company.email && <span>{company.email}</span>}{company.phone && <span>{company.phone}</span>}</div><div className="invoice-date-block"><div><span>ISSUED ON</span><strong>{formatDate(invoice.date)}</strong></div><div><span>DUE DATE</span><strong>{invoice.due ? formatDate(invoice.due) : 'Upon receipt'}</strong></div></div></div>
            <div className="billto"><span>BILLED TO</span><strong>{invoice.client.name || 'Client name'}</strong>{invoice.client.contact && <span>{invoice.client.contact}</span>}{invoice.client.address && <span>{invoice.client.address}</span>}{invoice.client.email && <span>{invoice.client.email}</span>}{invoice.client.phone && <span>{invoice.client.phone}</span>}</div>
            {invoice.client.project && <div className="project-ref"><span>PROJECT</span><strong>{invoice.client.project}</strong></div>}
            <div className="paper-items"><div className="paper-items-header"><span>DESCRIPTION</span><span>QTY</span><span>RATE</span><span>AMOUNT</span></div>{invoice.items.filter(item => item.name || Number(item.price)).map((item, i) => <div className="paper-item" key={i}><span>{item.name || 'Service item'}</span><span>{item.quantity || 0}</span><span>{money(item.price, invoice.currency)}</span><strong>{money((Number(item.quantity) || 0) * (Number(item.price) || 0), invoice.currency)}</strong></div>)}</div>
            <div className="paper-total"><span>Subtotal</span><strong>{money(subtotal, invoice.currency)}</strong>{discountAmount > 0 && <><span>Discount{discountType === 'percent' ? ` (${Math.min(discountValue, 100)}%)` : ''}</span><strong>−{money(discountAmount, invoice.currency)}</strong></>}<span>Tax</span><strong>{money(0, invoice.currency)}</strong><div><b>Total due</b><b>{money(totalDue, invoice.currency)}</b></div></div>
            <div className="paper-payments"><span className="paper-section-label">{invoice.scheduleEnabled ? 'PAYMENT SCHEDULE' : 'PAYMENT TERMS'}</span>{invoice.scheduleEnabled ? invoice.milestones.map((milestone, i) => <div className="paper-payment" key={i}><span className="payment-number">{milestone.paid ? '✓' : i + 1}</span><span><strong>{milestone.name || `Milestone ${i + 1}`}</strong><small>{milestone.paid ? 'Payment received' : `${milestone.percent}% due${milestone.due ? ` · ${formatDate(milestone.due)}` : ''}`}</small></span><b>{money(totalDue * (Number(milestone.percent) || 0) / 100, invoice.currency)}</b></div>) : <div className="prepaid-terms">Prepaid in full · {money(totalDue, invoice.currency)}</div>}{upiQr && <div className="upi-payment"><img src={upiQr} alt="UPI payment QR code"/><div><strong>SCAN &amp; PAY</strong><span>{money(totalDue, 'INR')}</span></div></div>}</div>
            {invoice.note && <div className="paper-bottom"><div><span className="paper-section-label">NOTE</span><p>{invoice.note}</p></div></div>}
            {company.owner && <div className="signature">{company.signature ? <img src={company.signature} alt="Company signature" style={{ width: `${(Number(layout.signatureSize) || 28) * 2.8}px`, height: 'auto' }}/> : <span>Prepared by</span>}<div className="signature-owner"><strong>{company.owner}</strong>{company.name && <small>{company.name}</small>}</div></div>}
            
          </article>
          <p className="preview-hint">Your PDF will be formatted for A4 paper.</p>
        </aside>
      </section>}

      {page === 'history' && <section className="simple-page"><div className="page-intro"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Invoice history</h1><p>Invoices and drafts saved in this browser.</p></div><div className="history-page-actions"><button className="button-secondary" onClick={exportHistoryToExcel} disabled={!history.length}>Export Excel</button><button className="button-primary" onClick={startNewInvoice}>＋ New invoice</button></div></div>{company.showMonthlyRevenue !== false && <div className="monthly-revenue-panel"><div><span className="eyebrow">REVENUE GENERATED THIS MONTH</span><p>Generated invoices dated {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${localDate()}T00:00:00`))}</p></div><div className="revenue-values">{Object.entries(monthlyRevenue).map(([currency, amount]) => <strong key={currency}>{money(amount, currency)}</strong>)}</div></div>}{history.length ? <div className="history-table"><div className="history-head"><span>INVOICE</span><span>CLIENT</span><span>DATE</span><span>AMOUNT</span><span>STATUS</span><span>ACTIONS</span></div>{history.map((item, index) => <div className="history-row" key={`${item.number}-${index}`}><strong>{item.number}</strong><span>{item.client?.name}</span><span>{formatDate(item.date)}</span><b>{money(item.total, item.currency)}</b><span className="status-pill">{item.status || 'Draft'}</span><div className="history-row-actions"><button onClick={() => { setInvoice({ ...item, client: { ...item.client }, items: [...(item.items || [])] }); setPage('generate'); }}>Edit</button><button className="history-delete" onClick={() => deleteHistoryInvoice(item)}>Delete</button></div></div>)}</div> : <div className="empty-state"><div className="empty-icon">↗</div><h2>Your invoices will appear here</h2><p>Save a draft or download an invoice PDF to add it here.</p><button className="button-secondary" onClick={startNewInvoice}>Create an invoice</button></div>}</section>}

      {page === 'products' && <section className="simple-page directory-page"><div className="page-intro"><div><span className="eyebrow">YOUR CATALOG</span><h1>Products</h1><p>Products are saved when you add them to an invoice.</p></div><button className="button-primary" onClick={() => setCatalog(current => [{ name: 'New product', price: 0 }, ...current])}>＋ Add product</button></div>{catalog.length ? <div className="directory-list"><div className="directory-head"><span>PRODUCT</span><span>UNIT PRICE ({company.currency})</span><span /></div>{catalog.map((product, index) => <div className="product-row" key={`${product.name}-${index}`}><input aria-label="Product name" value={product.name} onChange={e => setCatalog(current => current.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry))}/><label><span>{company.currency}</span><input aria-label="Product unit price" type="number" min="0" step="0.01" value={product.price} onChange={e => setCatalog(current => current.map((entry, i) => i === index ? { ...entry, price: e.target.value } : entry))}/></label><button className="remove" onClick={() => setCatalog(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${product.name}`}>×</button></div>)}</div> : <div className="empty-state"><h2>No products yet</h2><p>Products you add to invoices will show up here for next time.</p><button className="button-secondary" onClick={() => setCatalog([{ name: 'New product', price: 0 }])}>Add a product</button></div>}</section>}

      {page === 'clients' && <section className="simple-page directory-page"><div className="page-intro"><div><span className="eyebrow">YOUR CONTACTS</span><h1>Clients</h1><p>Client details are saved when you save or download an invoice.</p></div><button className="button-primary" onClick={startNewInvoice}>＋ New invoice</button></div>{clients.length ? <div className="directory-list client-list"><div className="directory-head"><span>CLIENT</span><span>CONTACT DETAILS</span><span /></div>{clients.map(client => <div className="client-row" key={client.id}><div><strong>{client.name}</strong>{client.address && <small>{client.address}</small>}</div><div>{client.contact && <span>{client.contact}</span>}{client.email && <span>{client.email}</span>}{client.phone && <span>{client.phone}</span>}</div><button className="button-secondary" onClick={() => addClientToInvoice(client)}>Use on invoice</button></div>)}</div> : <div className="empty-state"><h2>Your clients will appear here</h2><p>Save a draft or download an invoice to keep client details for next time.</p><button className="button-secondary" onClick={startNewInvoice}>Create an invoice</button></div>}</section>}

      {page === 'admin' && <section className="simple-page admin-page"><div className="page-intro"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h1>Make it yours</h1><p>Your company details and signature will appear on invoices.</p></div></div><div className="admin-grid"><section className="settings-section"><div className="setting-title"><h2>Company profile</h2><p>Brand and contact details that appear on the invoice.</p></div><div className="logo-upload"><img src={company.logo || logoPath} alt="Company logo preview"/><label className="upload-button">Change logo<input type="file" accept="image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setCompany(current => ({ ...current, logo: reader.result })); reader.readAsDataURL(file); }} /></label><span>PNG or JPG · kept in this browser</span></div><label className="history-revenue-toggle"><input type="checkbox" checked={company.showMonthlyRevenue !== false} onChange={e => setCompany(current => ({ ...current, showMonthlyRevenue: e.target.checked }))}/><span><strong>Show monthly revenue on Invoice History</strong><small>Display a monthly total for generated invoices.</small></span></label><div className="settings-fields"><Field label="Company name" value={company.name} onChange={e => setCompany({ ...company, name: e.target.value })} /><Field label="Your name" value={company.owner} onChange={e => setCompany({ ...company, owner: e.target.value })} /><Field label="Email address" value={company.email} onChange={e => setCompany({ ...company, email: e.target.value })} type="email" placeholder="you@company.com" /><Field label="Phone number" value={company.phone} onChange={e => setCompany({ ...company, phone: e.target.value })} placeholder="Optional" /><Field label="Website" value={company.website} onChange={e => setCompany({ ...company, website: e.target.value })} placeholder="Optional" /><Field label="UPI ID" value={company.upiId || ''} onChange={e => setCompany({ ...company, upiId: e.target.value })} placeholder="name@bank" /><label className="field span-two"><span>Company address</span><textarea rows="2" value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })} placeholder="Street, city, region, postal code" /></label><label className="field"><span>Invoice currency</span><select value={company.currency} onChange={e => { setCompany({ ...company, currency: e.target.value }); updateInvoice({ currency: e.target.value }); }}><option value="USD">USD · US Dollar</option><option value="CAD">CAD · Canadian Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British Pound</option><option value="INR">INR · Indian Rupee</option></select></label></div></section><section className="settings-section"><div className="setting-title"><h2>Signature</h2><p>Draw your signature below to include it on invoices.</p></div><canvas ref={signatureCanvas} className="signature-canvas" width="720" height="190" onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={finishSignature} onPointerCancel={finishSignature} aria-label="Draw your company signature"/><div className="signature-actions"><span>{company.signature ? 'Signature saved in this browser' : 'Sign with your mouse, trackpad or touch'}</span><button className="text-action" onClick={clearSignature}>Clear signature</button></div><div className="setting-title notes-settings-title"><h2>Saved notes</h2><p>Tap a note in the invoice editor to reuse it.</p></div>{company.notes.map((note, i) => <div className="saved-note-row" key={i}><textarea value={note} onChange={e => setCompany(current => ({ ...current, notes: current.notes.map((entry, index) => index === i ? e.target.value : entry) }))} rows="2"/><button className="remove" onClick={() => setCompany(current => ({ ...current, notes: current.filter((_, index) => index !== i) }))}>×</button></div>)}<button className="text-action" onClick={() => setCompany(current => ({ ...current, notes: [...current.notes, ''] }))}>＋ Add a note</button><div className="local-data-note">Your settings, signature, products and clients are stored locally in this browser. Email delivery can be connected later.</div></section><section className="settings-section layout-settings"><div className="setting-title"><h2>Invoice layout</h2><p>Adjust the PDF logo, text and signature position. Changes preview on the invoice immediately.</p></div><div className="layout-controls"><label className="layout-control"><span>Logo width <b>{layout.logoSize} mm</b></span><input aria-label="Logo width in PDF" type="range" min="40" max="95" step="1" value={layout.logoSize} onChange={e => updateLayout({ logoSize: Number(e.target.value) })}/></label><label className="layout-control"><span>Top margin <b>{layout.topMargin ?? 8} mm</b></span><input aria-label="PDF top margin" type="range" min="0" max="25" step="1" value={layout.topMargin ?? 8} onChange={e => updateLayout({ topMargin: Number(e.target.value) })}/></label><label className="layout-control"><span>PDF text size <b>{layout.textSize} pt</b></span><input aria-label="PDF text size" type="range" min="10" max="20" step="1" value={layout.textSize} onChange={e => updateLayout({ textSize: Number(e.target.value) })}/></label><label className="layout-control"><span>Space: logo to orange line <b>{layout.logoLineGap ?? 0} mm</b></span><input aria-label="Space between logo and line" type="range" min="0" max="15" step="1" value={layout.logoLineGap ?? 0} onChange={e => updateLayout({ logoLineGap: Number(e.target.value) })}/></label><label className="layout-control"><span>Move invoice title down <b>{layout.invoiceLineGap ?? 0} mm</b></span><input aria-label="Invoice title vertical offset" type="range" min="-15" max="15" step="1" value={layout.invoiceLineGap ?? 0} onChange={e => updateLayout({ invoiceLineGap: Number(e.target.value) })}/></label><label className="layout-control"><span>Signature size <b>{layout.signatureSize ?? defaultLayout.signatureSize} mm</b></span><input aria-label="Signature size in PDF" type="range" min="12" max="40" step="1" value={layout.signatureSize ?? defaultLayout.signatureSize} onChange={e => updateLayout({ signatureSize: Number(e.target.value) })}/></label><label className="layout-control"><span>Signature horizontal position <b>{layout.signatureX}%</b></span><input aria-label="Signature horizontal position" type="range" min="65" max="98" step="1" value={layout.signatureX} onChange={e => updateLayout({ signatureX: Number(e.target.value) })}/></label><label className="layout-control"><span>Signature vertical position <b>{layout.signatureY}%</b></span><input aria-label="Signature vertical position" type="range" min="55" max="85" step="1" value={layout.signatureY} onChange={e => updateLayout({ signatureY: Number(e.target.value) })}/></label></div><div className="layout-footer"><span role="status">{layoutDirty ? 'Unsaved layout changes' : 'Saved layout'}</span><button className="button-primary" onClick={saveLayout}>Save layout</button></div><p className="layout-help">Signature position is measured from the top-left of the A4 invoice. The signature sits above your name.</p></section></div></section>}
    </main>
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

function Field({ label, value, onChange, placeholder = '', type = 'text', required = false }) {
  return <label className="field"><span>{label}{required && <b className="required"> *</b>}</span><input type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder} /></label>;
}
function pdfMoney(value, currency) { return money(value, currency); }
function drawPdfMoney(doc, value, currency, x, baselineY, bold = false, prefix = '', align = 'right') {
  const canvas = document.createElement('canvas');
  const scale = 4;
  const fontSize = doc.getFontSize();
  const style = bold ? '700' : '400';
  const font = `${style} ${fontSize * scale}px Arial, "Noto Sans", sans-serif`;
  const context = canvas.getContext('2d');
  context.font = font;
  const text = `${prefix}${money(value, currency)}`;
  const width = Math.ceil(context.measureText(text).width + 4 * scale);
  const height = Math.ceil(fontSize * scale * 1.5);
  canvas.width = width; canvas.height = height;
  const draw = canvas.getContext('2d'); draw.font = font; draw.fillStyle = '#2a2521'; draw.textBaseline = 'alphabetic';
  draw.fillText(text, 2 * scale, fontSize * scale * 1.08);
  const widthMm = width * 25.4 / (72 * scale), heightMm = height * 25.4 / (72 * scale);
  const xPos = align === 'right' ? x - widthMm : x;
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', xPos, baselineY - fontSize * 0.381, widthMm, heightMm, undefined, 'FAST');
  return widthMm;
}
function formatDate(date) { if (!date) return '—'; return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)); }
