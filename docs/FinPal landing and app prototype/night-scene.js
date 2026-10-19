(() => {
  if (customElements.get('night-scene')) return;
  const rnd = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  class NightScene extends HTMLElement {
    connectedCallback() {
      if (this.live) return; this.live = true;
      Object.assign(this.style, { display: 'block', width: '100%', height: '100%', position: this.style.position || 'relative' });
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      this.appendChild(c); this.c = c; this.ctx = c.getContext('2d');
      this.m = [0, 0]; this.tm = [0, 0];
      this.onMove = (e) => { this.tm = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; };
      addEventListener('pointermove', this.onMove);
      this.ro = new ResizeObserver(() => this.build()); this.ro.observe(this); this.build();
      const loop = (t) => { this.raf = requestAnimationFrame(loop); this.draw(t / 1000); };
      this.raf = requestAnimationFrame(loop);
    }
    build() {
      const r = this.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.5);
      const W = (this.c.width = Math.max(1, r.width * d)), H = (this.c.height = Math.max(1, r.height * d));
      const R = rnd(7);
      this.stars = Array.from({ length: Math.round(W * H / 5000) }, () => ({ x: R() * W, y: R() * H * 0.62, r: (R() * 1.1 + 0.3) * d, p: R() * 6.28, s: 0.5 + R() * 2 }));
      this.clouds = Array.from({ length: 9 }, () => ({ x: R() * W * 1.4 - W * 0.2, y: H * (0.12 + R() * 0.38), w: W * (0.18 + R() * 0.22), v: (4 + R() * 8) * d, blobs: Array.from({ length: 9 }, () => [R() - 0.5, (R() - 0.5) * 0.35, 0.25 + R() * 0.5]) }));
      const ridge = (seed, base, amp, rough) => {
        const Rr = rnd(seed), N = 257, a = new Array(N).fill(0);
        a[0] = Rr(); a[N - 1] = Rr();
        for (let step = N - 1, sc = 1; step > 1; step /= 2, sc *= rough)
          for (let i = 0; i < N - 1; i += step) { const m = i + step / 2; a[m] = (a[i] + a[i + step]) / 2 + (Rr() - 0.5) * sc; }
        return a.map((v) => H * base - v * H * amp);
      };
      this.layers = [
        { pts: ridge(11, 0.62, 0.22, 0.55), top: '#3A4A70', bot: '#121A2E', par: 6 },
        { pts: ridge(23, 0.72, 0.26, 0.52), top: '#2A3656', bot: '#0B1120', par: 14 },
        { pts: ridge(41, 0.86, 0.2, 0.5), top: '#1A2238', bot: '#05070C', par: 26 },
      ];
      this.W = W; this.H = H; this.d = d;
    }
    draw(t) {
      const { ctx, W, H, d } = this; if (!W) return;
      this.m[0] += (this.tm[0] - this.m[0]) * 0.05; this.m[1] += (this.tm[1] - this.m[1]) * 0.05;
      const mx = this.m[0], my = this.m[1];
      let g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070C1C'); g.addColorStop(0.45, '#152244'); g.addColorStop(0.7, '#25365C'); g.addColorStop(1, '#0A1020');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p)); ctx.fillStyle = '#E8EEFF'; ctx.beginPath(); ctx.arc(s.x - mx * 4 * d, s.y - my * 3 * d, s.r, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1;
      const Mx = W * 0.84 - mx * 8 * d, My = H * 0.2 - my * 6 * d, Mr = Math.min(W, H) * 0.032;
      g = ctx.createRadialGradient(Mx, My, Mr, Mx, My, Mr * 9); g.addColorStop(0, 'rgba(190,210,255,0.28)'); g.addColorStop(1, 'rgba(190,210,255,0)');
      ctx.fillStyle = g; ctx.fillRect(Mx - Mr * 9, My - Mr * 9, Mr * 18, Mr * 18);
      g = ctx.createRadialGradient(Mx - Mr * 0.3, My - Mr * 0.3, 0, Mx, My, Mr); g.addColorStop(0, '#F6F8FF'); g.addColorStop(1, '#C9D3E8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Mx, My, Mr, 0, 6.28); ctx.fill();
      for (const c of this.clouds) {
        const x = ((c.x + t * c.v) % (W * 1.5)) - W * 0.25 - mx * 10 * d;
        for (const [bx, by, br] of c.blobs) {
          const px = x + bx * c.w, py = c.y + by * c.w - my * 8 * d, rr = br * c.w * 0.5;
          g = ctx.createRadialGradient(px, py - rr * 0.2, 0, px, py, rr);
          g.addColorStop(0, 'rgba(150,168,210,0.16)'); g.addColorStop(1, 'rgba(150,168,210,0)');
          ctx.fillStyle = g; ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
        }
      }
      this.layers.forEach((L, li) => {
        const off = -mx * L.par * d, n = L.pts.length;
        ctx.beginPath(); ctx.moveTo(-40 * d, H);
        L.pts.forEach((y, i) => ctx.lineTo(-40 * d + (i / (n - 1)) * (W + 80 * d) + off, y - my * L.par * 0.5 * d));
        ctx.lineTo(W + 40 * d, H); ctx.closePath();
        const minY = Math.min(...L.pts);
        g = ctx.createLinearGradient(0, minY, 0, H); g.addColorStop(0, L.top); g.addColorStop(0.5, L.bot); g.addColorStop(1, '#04060B');
        ctx.fillStyle = g; ctx.fill();
        if (li < 2) { g = ctx.createLinearGradient(0, H * (0.55 + li * 0.12), 0, H * (0.8 + li * 0.1)); g.addColorStop(0, 'rgba(120,140,190,0)'); g.addColorStop(0.5, 'rgba(120,140,190,0.10)'); g.addColorStop(1, 'rgba(120,140,190,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      });
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); removeEventListener('pointermove', this.onMove); this.ro && this.ro.disconnect(); this.innerHTML = ''; this.live = false; }
  }
  customElements.define('night-scene', NightScene);
})();
