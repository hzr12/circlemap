/**
 * 圆圈地图 - 地图管理器
 * ============================================
 * 使用 Canvas 叠加层绘制同心圆（样式参照 demo.html）
 * 纬向墨卡托投影坐标 → 容器像素转换
 */

class MapManager {
  constructor() {
    this.map = null;
    this.marker = null;
    this.canvas = null;
    this.ctx = null;
    this.center = null;
    this.currentRadius = 0;
    this.mode = 'click';

    this._rafId = null;

    // 回调钩子
    this.onCenterChange = null;
  }

  /**
   * 初始化地图 + Canvas 叠加层
   */
  init(containerId, center, zoom) {
    const mapEl = document.getElementById(containerId);

    // —— Canvas 叠加层 ——
    this.canvas = document.getElementById('circle-canvas');
    this.ctx = this.canvas.getContext('2d');

    // —— 腾讯地图 ——
    this.map = new qq.maps.Map(mapEl, {
      center: new qq.maps.LatLng(center.lat, center.lng),
      zoom: zoom || CONFIG.DEFAULT_ZOOM,
      mapTypeId: qq.maps.MapTypeId.ROADMAP
    });

    // 点击选点
    qq.maps.event.addListener(this.map, 'click', (event) => {
      if (this.mode !== 'click') return;
      if (!event.latLng) return;
      this.setCenter({ lat: event.latLng.getLat(), lng: event.latLng.getLng() });
    });

    // 地图变化 → 重绘 Circle Canvas
    qq.maps.event.addListener(this.map, 'zoom_changed', () => this._scheduleRedraw());
    qq.maps.event.addListener(this.map, 'drag', () => this._scheduleRedraw());
    qq.maps.event.addListener(this.map, 'dragend', () => this._scheduleRedraw());

    // 窗口大小变化
    window.addEventListener('resize', () => {
      this._resizeCanvas();
      this._scheduleRedraw();
    });

    // 初始化尺寸
    this._resizeCanvas();
    this._scheduleRedraw();

    return this;
  }

  /* ================================================================
   *  坐标 → 像素 转换
   * ================================================================ */

  /**
   * 经纬度 → 容器像素坐标
   * 使用地图投影计算世界坐标，再根据缩放/中心点换算
   */
  _latLngToContainerPoint(latLng) {
    const proj = this.map.getProjection();
    if (!proj) return null;

    const wp = proj.fromLatLngToPoint(latLng);
    if (!wp || typeof wp.x !== 'number') return null;

    const zoom = this.map.getZoom();
    const ctr = this.map.getCenter();
    const cwp = proj.fromLatLngToPoint(ctr);
    if (!cwp) return null;

    const w = this.canvas.parentElement.offsetWidth;
    const h = this.canvas.parentElement.offsetHeight;
    const scale = Math.pow(2, zoom);

    return {
      x: w / 2 + (wp.x - cwp.x) * scale,
      y: h / 2 + (wp.y - cwp.y) * scale
    };
  }

  /**
   * 地面距离（米）→ 屏幕像素
   * 公式：1px = 156543.03392 * cos(lat) / 2^zoom （米）
   */
  _metersToPixels(meters, latLng) {
    if (meters <= 0) return 0;
    const zoom = this.map.getZoom();
    const lat = latLng.getLat();
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    return meters / mpp;
  }

  /* ================================================================
   *  Canvas 尺寸
   * ================================================================ */

  _resizeCanvas() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.offsetWidth * dpr;
    this.canvas.height = parent.offsetHeight * dpr;
    this.canvas.style.width = parent.offsetWidth + 'px';
    this.canvas.style.height = parent.offsetHeight + 'px';
  }

  /* ================================================================
   *  同心圆渲染（核心 — 样式匹配 demo.html）
   * ================================================================ */

  _scheduleRedraw() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => this._redraw());
  }

  _redraw() {
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    const parent = this.canvas.parentElement;

    this._resizeCanvas();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, parent.offsetWidth, parent.offsetHeight);

    if (!this.center || this.currentRadius <= 0) return;

    const latLng = new qq.maps.LatLng(this.center.lat, this.center.lng);
    const cp = this._latLngToContainerPoint(latLng);
    if (!cp) return;

    const maxR = this.currentRadius;
    const interval = CONFIG.CONCENTRIC_INTERVAL;

    const mp = this._metersToPixels(maxR, latLng);   // 外圈像素半径
    const ip = this._metersToPixels(interval, latLng); // 间距像素

    const { x: cx, y: cy } = cp;

    // 太小则不绘制
    if (mp < CONFIG.MIN_DRAW_PX) return;

    // 间距像素 ≥ 2px 才画内部圈
    const drawInner = ip >= 2;
    const ringCount = drawInner ? Math.max(1, Math.floor(mp / ip)) : 0;

    // ── 1. 整体半透明底色 ──
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, mp), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70, 140, 220, 0.08)';
    ctx.fill();

    // ── 2. 间隔填充（偶数圈加深） ──
    if (drawInner) {
      for (let i = ringCount; i >= 1; i--) {
        const ro = i * ip;
        const ri = (i - 1) * ip;
        if (ro > mp) continue;
        if (i % 2 === 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, ro), 0, Math.PI * 2);
          ctx.arc(cx, cy, Math.max(0.5, ri), 0, Math.PI * 2, true);
          ctx.fillStyle = 'rgba(70, 140, 220, 0.05)';
          ctx.fill();
        }
      }
    }

    // ── 3. 内部圈描边（细线） ──
    if (drawInner) {
      ctx.strokeStyle = 'rgba(15, 50, 120, 0.32)';
      ctx.lineWidth = 1.2;
      for (let j = 1; j <= ringCount; j++) {
        const r = j * ip;
        if (r > mp) break;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── 4. 最外圈描边（粗线） ──
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, mp), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(10, 35, 90, 0.55)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // ── 5. 圆心标记 ──
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(15, 50, 120, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 50, 120, 0.8)';
    ctx.fill();
  }

  /* ================================================================
   *  公开 API
   * ================================================================ */

  /**
   * 设置/移动中心点（仅移动标记 + 面板，不触发画圆）
   */
  setCenter(center) {
    this.center = center;
    const latLng = new qq.maps.LatLng(center.lat, center.lng);

    if (this.marker) {
      this.marker.setPosition(latLng);
    } else {
      this.marker = new qq.maps.Marker({
        position: latLng,
        map: this.map,
        draggable: true
      });
      // 标记拖拽 → 同步更新已绘制的圆形
      qq.maps.event.addListener(this.marker, 'dragend', (event) => {
        const pos = event.latLng;
        this.center = { lat: pos.lat, lng: pos.lng };
        this._scheduleRedraw();
        if (this.onCenterChange) {
          this.onCenterChange(this.center);
        }
      });
    }

    this.map.panTo(latLng);

    if (this.onCenterChange) {
      this.onCenterChange(this.center);
    }
  }

  /**
   * 绘制同心圆（总是以最新参数重绘）
   */
  drawCircle(center, radius) {
    this.center = center;
    this.currentRadius = radius;
    this._scheduleRedraw();
    this._zoomToRadius(radius);
  }

  /**
   * 更新半径
   */
  updateRadius(radius) {
    if (!this.center) return;
    this.currentRadius = radius;
    this._scheduleRedraw();
    this._zoomToRadius(radius);
  }

  /**
   * 清除同心圆
   */
  removeCircle() {
    this.currentRadius = 0;
    this._scheduleRedraw();
  }

  /**
   * 设置交互模式
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * 跳转到位置（不改变标记）
   */
  flyTo(center, zoom) {
    if (!this.map) return;
    this.map.panTo(new qq.maps.LatLng(center.lat, center.lng));
    this.map.setZoom(zoom || CONFIG.LOCATION_ZOOM);
  }

  /**
   * 自适应缩放
   */
  _zoomToRadius(radius) {
    if (!this.map) return;
    const entry = CONFIG.ZOOM_MAP.find(e => radius <= e.maxRadius);
    if (entry) this.map.setZoom(entry.zoom);
  }

  destroy() {
    if (this.marker) {
      this.marker.setMap(null);
      this.marker = null;
    }
    this.map = null;
    this.center = null;
  }
}
