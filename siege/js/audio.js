/**
 * LAST KEEP — compact WebAudio synth. No assets, no network.
 */
(function (NS) {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.voices = 0;
    this.maxVoices = 6;
  }

  Audio.prototype.init = function () {
    if (this.ctx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);

    var len = Math.floor(this.ctx.sampleRate * 0.5);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  };

  Audio.prototype.unlock = function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.45 : 0;
  };

  Audio.prototype.frame = function () { this.voices = 0; };

  Audio.prototype._ready = function () {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  };

  /** Short blip; `type` picks the character. */
  Audio.prototype.tone = function (freq, dur, type, gain, sweepTo) {
    if (!this._ready() || this.voices >= this.maxVoices) return;
    this.voices++;
    var ctx = this.ctx, t = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  Audio.prototype.burst = function (dur, from, to, gain) {
    if (!this._ready() || this.voices >= this.maxVoices) return;
    this.voices++;
    var ctx = this.ctx, t = ctx.currentTime;

    var src = ctx.createBufferSource();
    src.buffer = this.noise;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  };

  Audio.prototype.shoot = function (tower) {
    if (tower === 'mortar') this.burst(0.14, 900, 180, 0.22);
    else if (tower === 'tesla') this.tone(1400, 0.06, 'sawtooth', 0.1, 2600);
    else if (tower === 'frost') this.tone(900, 0.08, 'sine', 0.1, 1500);
    else this.tone(320, 0.07, 'square', 0.12, 160);
  };

  /** Kill blip — pitch climbs with the tap combo, so a streak sings. */
  Audio.prototype.kill = function (combo) {
    var step = Math.min(combo || 0, 20);
    this.tone(420 * Math.pow(2, step / 24), 0.09, 'triangle', 0.16, 220);
  };

  Audio.prototype.tap = function (hit, combo) {
    if (!hit) { this.tone(180, 0.04, 'sine', 0.05); return; }
    this.tone(600 + Math.min(combo, 20) * 40, 0.05, 'square', 0.1);
  };

  Audio.prototype.leak = function () {
    this.burst(0.4, 500, 60, 0.45);
    this.tone(90, 0.35, 'sawtooth', 0.3, 40);
  };

  Audio.prototype.wave = function (boss) {
    if (boss) {
      this.tone(70, 0.9, 'sawtooth', 0.4, 40);
      this.tone(140, 0.7, 'square', 0.2, 90);
    } else {
      this.tone(300, 0.16, 'triangle', 0.16, 450);
    }
  };

  Audio.prototype.overcharge = function () {
    this.burst(0.6, 200, 6000, 0.5);
    this.tone(160, 0.7, 'sine', 0.4, 30);
  };

  Audio.prototype.buy = function () {
    this.tone(700, 0.05, 'square', 0.12);
    this.tone(1050, 0.08, 'square', 0.1);
  };

  Audio.prototype.over = function () {
    this.tone(220, 1.2, 'sawtooth', 0.35, 55);
  };

  NS.Audio = Audio;
})(window.SIEGE);
