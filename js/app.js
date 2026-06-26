/**
 * 圆圈地图 - 主应用控制器
 * ============================================
 * 协调 MapManager、GPSManager 与 UI 交互
 * 是所有模块的入口
 */

class App {
  constructor() {
    this.mapManager = new MapManager();
    this.gpsManager = new GPSManager();
    this.circleRadius = CONFIG.DEFAULT_RADIUS;
    this.center = null;
    this.mode = 'click';
  }

  /**
   * 应用入口
   */
  init() {
    // 初始化地图
    this.mapManager.init('map', CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

    // 注册中心点变化回调
    this.mapManager.onCenterChange = (center) => this._onCenterChanged(center);

    // 初始化 UI
    this._setupUI();

    // 读取 URL 参数
    this._checkUrlParams();

    // 显示加载完成
    console.log('[App] 初始化完成');
  }

  /* ============= UI 事件绑定 ============= */

  _setupUI() {
    // —— 模式切换 ——
    document.querySelectorAll('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => this._setMode(btn.dataset.mode));
    });

    // —— 坐标输入 ——
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');

    // 防抖处理输入变化
    let inputTimer;
    const handleCoordInput = () => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => this._onCoordInput(), 400);
    };

    latInput.addEventListener('input', handleCoordInput);
    lngInput.addEventListener('input', handleCoordInput);

    // —— 半径滑块 & 数字输入双向绑定 ——
    const radiusSlider = document.getElementById('radius-slider');
    const radiusInput = document.getElementById('radius-input');

    radiusSlider.addEventListener('input', () => {
      const val = parseInt(radiusSlider.value, 10);
      radiusInput.value = val;
      this.circleRadius = val;
      if (this.center) {
        this.mapManager.updateRadius(val);
        this._updateInfo();
      }
    });

    radiusInput.addEventListener('change', () => {
      let val = parseInt(radiusInput.value, 10);
      if (isNaN(val) || val < CONFIG.MIN_RADIUS) val = CONFIG.MIN_RADIUS;
      if (val > CONFIG.MAX_RADIUS) val = CONFIG.MAX_RADIUS;
      radiusInput.value = val;
      radiusSlider.value = val;
      this.circleRadius = val;
      if (this.center) {
        this.mapManager.updateRadius(val);
        this._updateInfo();
      }
    });

    // —— 绘制按钮 ——
    document.getElementById('draw-btn').addEventListener('click', () => this._drawCircle());

    // —— 清除按钮 ——
    document.getElementById('clear-btn').addEventListener('click', () => this._clearAll());

    // —— GPS 定位按钮 ——
    document.getElementById('gps-btn').addEventListener('click', () => this._locateMe());
  }

  /* ============= 核心交互方法 ============= */

  /**
   * 切换选择模式
   * @param {'click'|'input'} mode
   */
  _setMode(mode) {
    this.mode = mode;
    this.mapManager.setMode(mode);

    // 切换标签状态
    document.querySelectorAll('.mode-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 显示/隐藏输入区
    const inputGroup = document.getElementById('inputGroup');
    inputGroup.classList.toggle('visible', mode === 'input');

    // 显示/隐藏点击提示
    const clickHint = document.getElementById('clickHint');
    clickHint.classList.toggle('hidden', mode === 'input');
  }

  /**
   * 中心点变更时的回调（仅更新 UI，不自动绘制）
   */
  _onCenterChanged(center) {
    this.center = center;

    // 同步到输入框
    document.getElementById('lat').value = center.lat.toFixed(6);
    document.getElementById('lng').value = center.lng.toFixed(6);
  }

  /**
   * 手动输入坐标 → 仅定位，不自动绘制
   */
  _onCoordInput() {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);

    if (!isNaN(lat) && !isNaN(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180) {
      this.center = { lat, lng };
      this.mapManager.setCenter(this.center);
    }
  }

  /**
   * 绘制圆形
   */
  _drawCircle() {
    if (!this.center) {
      this._showToast('请先选择中心点（点击地图或输入坐标）');
      return;
    }
    if (this.circleRadius <= 0) {
      this._showToast('请输入有效的半径');
      return;
    }

    this.mapManager.drawCircle(this.center, this.circleRadius);
    this._updateInfo();
  }

  /**
   * 定位到我
   */
  async _locateMe() {
    const btn = document.getElementById('gps-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const pos = await this.gpsManager.getCurrentPosition();

      // 切换为 click 模式（避免循环触发）
      // 但保持 UI 显示
      this.center = { lat: pos.lat, lng: pos.lng };

      // 更新地图位置
      this.mapManager.setCenter(this.center);
      this.mapManager.flyTo(this.center);

      // 同步到输入框
      document.getElementById('lat').value = pos.lat.toFixed(6);
      document.getElementById('lng').value = pos.lng.toFixed(6);

      // 如果半径有效，自动绘制
      if (this.circleRadius > 0) {
        this.mapManager.drawCircle(this.center, this.circleRadius);
        this._updateInfo();
      }

      // 定位成功样式
      btn.classList.add('located');

      // 3秒后移除高亮
      setTimeout(() => {
        btn.classList.remove('located');
      }, 3000);

      this._showToast(`定位成功（精度 ±${pos.accuracy.toFixed(0)} 米）`);
    } catch (err) {
      this._showToast('❌ ' + err.message);
      btn.classList.remove('located');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  /**
   * 清除所有
   */
  _clearAll() {
    this.mapManager.removeCircle();
    // 不删除标记，只清除圆
    this.center = null;
    document.getElementById('lat').value = '';
    document.getElementById('lng').value = '';
    document.getElementById('infoArea').classList.add('hidden');
  }

  /* ============= 信息更新 ============= */

  /**
   * 更新信息展示区
   */
  _updateInfo() {
    const infoArea = document.getElementById('infoArea');

    if (!this.center || this.circleRadius <= 0) {
      infoArea.classList.add('hidden');
      return;
    }

    infoArea.classList.remove('hidden');

    // 中心坐标
    document.getElementById('info-center').textContent =
      `${this.center.lat.toFixed(6)}, ${this.center.lng.toFixed(6)}`;

    // 半径
    document.getElementById('info-radius').textContent =
      this.circleRadius >= 1000
        ? `${(this.circleRadius / 1000).toFixed(2)} km`
        : `${this.circleRadius} m`;

    // 面积：πr²
    const area = Math.PI * this.circleRadius * this.circleRadius;
    document.getElementById('info-area').textContent =
      area >= 1e6
        ? `${(area / 1e6).toFixed(2)} km²`
        : `${area.toFixed(0)} m²`;

    // 同心圆圈数
    const ringCount = Math.ceil(this.circleRadius / CONFIG.CONCENTRIC_INTERVAL);
    document.getElementById('info-rings').textContent = `${ringCount} 圈`;
  }

  /* ============= URL 参数 ============= */

  /**
   * 从 URL 参数读取初始状态
   * 支持：?lat=39.9&lng=116.4&radius=1000
   */
  _checkUrlParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const lat = parseFloat(params.get('lat'));
      const lng = parseFloat(params.get('lng'));
      const radius = parseInt(params.get('radius'), 10);

      if (!isNaN(lat) && !isNaN(lng) &&
          lat >= -90 && lat <= 90 &&
          lng >= -180 && lng <= 180) {
        this.center = { lat, lng };
        this.mapManager.setCenter(this.center);

        if (!isNaN(radius) && radius >= CONFIG.MIN_RADIUS && radius <= CONFIG.MAX_RADIUS) {
          this.circleRadius = radius;
          document.getElementById('radius-slider').value = radius;
          document.getElementById('radius-input').value = radius;
          this.mapManager.drawCircle(this.center, radius);
          this._updateInfo();
        }
      }
    } catch (e) {
      // 静默忽略 URL 解析错误
    }
  }

  /* ============= Toast 提示 ============= */

  /**
   * 显示短暂提示
   */
  _showToast(message) {
    // 移除已有 toast
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // 自动消失
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

/* ============= 启动 ============= */

// DOM 就绪后启动
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  // 暴露到全局便于调试
  window.app = app;
});

// 如果 DOM 已经加载，直接启动
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  const app = new App();
  app.init();
  window.app = app;
}
