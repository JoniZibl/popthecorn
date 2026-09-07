/**
 * POPCORE — tiny WebAudio synth. No assets, no network.
 *
 * Pops are a filtered noise burst plus a short pitched "thock" whose pitch
 * climbs with the chain, so a long chain rises like an arpeggio. Voice count
 * is capped per frame so a 200-pop chain does not blow out the mix.
 */
(function (NS) {
  'use strict';

  // Minor pentatonic — every note lands, whatever order the chain fires in.
  var PENTATONIC = [0, 3, 5, 7, 10];

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.voicesThisFrame = 0;
    this.maxVoicesPerFrame = 5;
  }

  Audio.prototype.init = function () {
    if (this.ctx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused by every pop.
    var len = Math.floor(this.ctx.sampleRate * 0.5);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  };

  /** Browsers require a user gesture before audio starts. */
  Audio.prototype.unlock = function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
  };

  Audio.prototype.frame = function () { this.voicesThisFrame = 0; };

  Audio.prototype._ready = function () {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  };

  Audio.prototype.pop = function (chain, manual) {
    if (!this._ready()) return;
    if (this.voicesThisFrame >= this.maxVoicesPerFrame) return;
    this.voicesThisFrame++;

    var ctx = this.ctx;
    var t = ctx.currentTime;
    // A chain climbs a minor-pentatonic ladder, so a cascade plays as a rising
    // riff instead of a smear of noise. It wraps after four octaves.
    var step = Math.min(chain, 40) - 1;
    var semis = PENTATONIC[step % PENTATONIC.length] + 12 * Math.floor(step / PENTATONIC.length);
    var pitch = 200 * Math.pow(2, Math.min(semis, 48) / 12);
    var gain = manual ? 0.5 : 0.34;

    // noise body
    var src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = NS.rand(0.9, 1.25);

    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(Math.min(pitch * 3.2, 9000), t);
    bp.Q.value = 1.6;

    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    src.connect(bp); bp.connect(ng); ng.connect(this.master);
    src.start(t); src.stop(t + 0.14);

    // pitched thock
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(Math.min(pitch * 2, 3200), t);
    osc.frequency.exponentialRampToValueAtTime(Math.min(pitch, 2000), t + 0.07);

    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(gain * 0.6, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.1);
  };

  /** Milestone boom — a low sweep under the pops. */
  Audio.prototype.tier = function (tier) {
    if (!this._ready()) return;
    var ctx = this.ctx;
    var t = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180 + tier * 30, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.62);
  };

  /** Golden kernel: a quick bright arpeggio on top of the pop. */
  Audio.prototype.golden = function () {
    if (!this._ready()) return;
    var ctx = this.ctx;
    var t0 = ctx.currentTime;

    for (var i = 0; i < 4; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 660 * Math.pow(2, [0, 4, 7, 12][i] / 12);

      var g = ctx.createGain();
      var t = t0 + i * 0.055;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.24);
    }
  };

  /** MEGA POP: a downward whoosh with a deep impact underneath. */
  Audio.prototype.mega = function () {
    if (!this._ready()) return;
    var ctx = this.ctx;
    var t = ctx.currentTime;

    var src = ctx.createBufferSource();
    src.buffer = this.noise;

    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(240, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.28);

    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    src.connect(bp); bp.connect(ng); ng.connect(this.master);
    src.start(t); src.stop(t + 0.52);

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.7);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.82);
  };

  /** Purchase blip. */
  Audio.prototype.buy = function () {
    if (!this._ready()) return;
    var ctx = this.ctx;
    var t = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.setValueAtTime(990, t + 0.06);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.18);
  };

  NS.Audio = Audio;
})(window.POPCORE);
