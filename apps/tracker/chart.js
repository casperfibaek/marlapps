/**
 * Generic canvas chart for numeric tracker data.
 * Ported from weight-tracker, adapted for arbitrary numeric values.
 */

export function drawChart(canvas, dataPoints, accentColorOverride) {
  // dataPoints: [{ date: 'YYYY-MM-DD', value: number }] sorted by date ascending
  if (!canvas || dataPoints.length < 2) return false;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const pad = { top: 20, right: 16, bottom: 30, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  const values = dataPoints.map(d => d.value);
  let minV = values[0];
  let maxV = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < minV) minV = values[i];
    if (values[i] > maxV) maxV = values[i];
  }
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }
  const rangeV = maxV - minV;
  const padV = rangeV * 0.1;
  minV -= padV;
  maxV += padV;

  const dates = dataPoints.map(d => new Date(d.date + 'T00:00:00').getTime());
  const minD = dates[0];
  const maxD = dates[dates.length - 1];
  const rangeD = maxD - minD || 1;

  const toX = (d) => pad.left + ((d - minD) / rangeD) * plotW;
  const toY = (v) => pad.top + plotH - ((v - minV) / (maxV - minV)) * plotH;

  // Theme-aware colors
  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue('--app-text-secondary').trim() || '#888';
  const gridColor = style.getPropertyValue('--app-border-light').trim() || 'rgba(255,255,255,0.08)';
  const accentColor = accentColorOverride || style.getPropertyValue('--app-accent').trim() || '#1ABC9C';
  const bgColor = style.getPropertyValue('--app-bg-secondary').trim() || '#1a1a2e';

  // Grid lines
  const gridLines = 5;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (plotH / gridLines) * i;
    const val = maxV - ((maxV - minV) / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(1), pad.left - 6, y + 4);
  }

  // Date labels
  ctx.textAlign = 'center';
  const labelCount = Math.min(dataPoints.length, Math.floor(plotW / 70));
  const step = Math.max(1, Math.floor(dataPoints.length / labelCount));
  for (let i = 0; i < dataPoints.length; i += step) {
    const x = toX(dates[i]);
    const d = new Date(dataPoints[i].date + 'T00:00:00');
    const label = (d.getMonth() + 1) + '/' + d.getDate();
    ctx.fillText(label, x, H - pad.bottom + 18);
  }

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  gradient.addColorStop(0, accentColor + '40');
  gradient.addColorStop(1, accentColor + '05');

  ctx.beginPath();
  ctx.moveTo(toX(dates[0]), pad.top + plotH);
  dataPoints.forEach((d, i) => ctx.lineTo(toX(dates[i]), toY(d.value)));
  ctx.lineTo(toX(dates[dates.length - 1]), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  dataPoints.forEach((d, i) => {
    const x = toX(dates[i]);
    const y = toY(d.value);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Data points
  dataPoints.forEach((d, i) => {
    const x = toX(dates[i]);
    const y = toY(d.value);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  return true;
}
