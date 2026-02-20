function projectIso(x, y, camera, width, height) {
  const rx = x - camera.x;
  const ry = y - camera.y;
  const px = (rx - ry) * 0.58;
  const py = (rx + ry) * 0.29;
  return {
    x: width * 0.5 + px,
    y: height * 0.56 + py
  };
}

function drawGrid(ctx, width, height, camera) {
  const centerX = width * 0.5;
  const centerY = height * 0.56;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#55d8ff';
  ctx.lineWidth = 1;

  for (let i = -8; i <= 8; i += 1) {
    const x0 = centerX + i * 64 - (camera.x * 0.42) % 64;
    ctx.beginPath();
    ctx.moveTo(x0, centerY - 20);
    ctx.lineTo(x0 + 180, height + 30);
    ctx.stroke();
  }

  ctx.strokeStyle = '#ffb35b';
  for (let j = 0; j < 10; j += 1) {
    const y = centerY + j * 46 - (camera.y * 0.22) % 46;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.lineTo(width + 20, y + 140);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAtmosphere(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#091225');
  sky.addColorStop(0.58, '#142748');
  sky.addColorStop(1, '#1f3557');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.08, 20, width * 0.5, height * 0.08, width * 0.55);
  glow.addColorStop(0, 'rgba(255,176,84,0.26)');
  glow.addColorStop(1, 'rgba(255,176,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawPoi(ctx, projected, event) {
  const markerHeight = 26;
  const markerWidth = 10;

  ctx.save();
  ctx.translate(projected.x, projected.y);

  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 14, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.moveTo(0, -markerHeight);
  ctx.lineTo(markerWidth, -8);
  ctx.lineTo(0, 10);
  ctx.lineTo(-markerWidth, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f4fbff';
  ctx.font = '600 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(event.sport, 0, -34);
  ctx.restore();
}

function drawPlayer(ctx, projected) {
  ctx.save();
  ctx.translate(projected.x, projected.y);

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 16, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2ad3ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(42,211,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -2, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderScene(ctx, width, height, state) {
  drawAtmosphere(ctx, width, height);
  drawGrid(ctx, width, height, state.camera);

  const projectedEvents = state.events
    .map((event) => ({ event, p: projectIso(event.x, event.y, state.camera, width, height) }))
    .filter((item) => item.p.y > -60 && item.p.y < height + 80 && item.p.x > -120 && item.p.x < width + 120)
    .sort((a, b) => a.p.y - b.p.y);

  projectedEvents.forEach(({ event, p }) => drawPoi(ctx, p, event));

  const projectedPlayer = projectIso(state.player.x, state.player.y, state.camera, width, height);
  drawPlayer(ctx, projectedPlayer);
}
