import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, RefreshCw, Volume2, Activity, Layers, Sliders, Save } from 'lucide-react';

// --- AUDIO ENGINE ---
// Generates synthesized drum samples into AudioBuffers for playback
const createAudioContext = () => {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
};

const SAMPLE_RATE = 44100;

const generateNoiseBuffer = (ctx: AudioContext) => {
  const bufferSize = ctx.sampleRate * 2.0; // 2 seconds
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

// Synthesis functions for drum sounds
const createKick = (ctx: AudioContext) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  return { osc, gain }; // Placeholder structure, actual generation happens in buffer
};

// We will render sounds to buffers for better performance and "sample-like" manipulation
async function createDrumBuffer(ctx: AudioContext, type: string): Promise<AudioBuffer> {
  const length = 1.0; // seconds
  const offlineCtx = new OfflineAudioContext(1, ctx.sampleRate * length, ctx.sampleRate);
  
  const osc = offlineCtx.createOscillator();
  const gain = offlineCtx.createGain();
  
  // Master compressor/limiter for the sound
  const dynamics = offlineCtx.createDynamicsCompressor();
  dynamics.threshold.value = -10;
  dynamics.knee.value = 40;
  dynamics.ratio.value = 12;
  dynamics.connect(offlineCtx.destination);

  switch (type) {
    case 'Kick':
      osc.frequency.setValueAtTime(150, 0);
      osc.frequency.exponentialRampToValueAtTime(0.01, 0.5);
      gain.gain.setValueAtTime(1, 0);
      gain.gain.exponentialRampToValueAtTime(0.01, 0.5);
      osc.connect(gain);
      gain.connect(dynamics);
      osc.start();
      break;

    case 'Snare':
      // Tone
      const snareOsc = offlineCtx.createOscillator();
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(100, 0);
      const snareGain = offlineCtx.createGain();
      snareGain.gain.setValueAtTime(0.5, 0);
      snareGain.gain.exponentialRampToValueAtTime(0.01, 0.2);
      snareOsc.connect(snareGain);
      snareGain.connect(dynamics);
      snareOsc.start();

      // Noise
      const noise = offlineCtx.createBufferSource();
      noise.buffer = generateNoiseBuffer(ctx);
      const noiseFilter = offlineCtx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      const noiseGain = offlineCtx.createGain();
      noiseGain.gain.setValueAtTime(0.8, 0);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, 0.2);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(dynamics);
      noise.start();
      break;

    case 'HiHat':
    case 'OpenHat':
      const hatNoise = offlineCtx.createBufferSource();
      hatNoise.buffer = generateNoiseBuffer(ctx);
      const hatFilter = offlineCtx.createBiquadFilter();
      hatFilter.type = 'highpass';
      hatFilter.frequency.value = 8000;
      const hatGain = offlineCtx.createGain();
      const decay = type === 'OpenHat' ? 0.4 : 0.05;
      hatGain.gain.setValueAtTime(0.6, 0);
      hatGain.gain.exponentialRampToValueAtTime(0.01, decay);
      hatNoise.connect(hatFilter);
      hatFilter.connect(hatGain);
      hatGain.connect(dynamics);
      hatNoise.start();
      break;

    case 'Clap':
      const clapNoise = offlineCtx.createBufferSource();
      clapNoise.buffer = generateNoiseBuffer(ctx);
      const clapFilter = offlineCtx.createBiquadFilter();
      clapFilter.type = 'bandpass';
      clapFilter.frequency.value = 1500;
      const clapGain = offlineCtx.createGain();
      clapGain.gain.setValueAtTime(0, 0);
      // Simulate multiple claps
      [0.01, 0.02, 0.03, 0.04].forEach(t => {
        clapGain.gain.setValueAtTime(0.5, t);
        clapGain.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
      });
      clapGain.gain.setValueAtTime(1, 0.05);
      clapGain.gain.exponentialRampToValueAtTime(0.01, 0.2);
      clapNoise.connect(clapFilter);
      clapFilter.connect(clapGain);
      clapGain.connect(dynamics);
      clapNoise.start();
      break;
      
    case 'Tom':
      osc.frequency.setValueAtTime(200, 0);
      osc.frequency.exponentialRampToValueAtTime(50, 0.4);
      gain.gain.setValueAtTime(0.8, 0);
      gain.gain.exponentialRampToValueAtTime(0.01, 0.4);
      osc.connect(gain);
      gain.connect(dynamics);
      osc.start();
      break;

    case 'Crash':
      const crashNoise = offlineCtx.createBufferSource();
      crashNoise.buffer = generateNoiseBuffer(ctx);
      const crashFilter = offlineCtx.createBiquadFilter();
      crashFilter.type = 'highpass';
      crashFilter.frequency.value = 3000;
      const crashGain = offlineCtx.createGain();
      crashGain.gain.setValueAtTime(0.8, 0);
      crashGain.gain.exponentialRampToValueAtTime(0.01, 1.5); // Long decay
      crashNoise.connect(crashFilter);
      crashFilter.connect(crashGain);
      crashGain.connect(dynamics);
      crashNoise.start();
      break;
      
    case 'Zap':
       osc.type = 'sawtooth';
       osc.frequency.setValueAtTime(800, 0);
       osc.frequency.exponentialRampToValueAtTime(50, 0.15);
       gain.gain.setValueAtTime(0.5, 0);
       gain.gain.exponentialRampToValueAtTime(0.01, 0.15);
       osc.connect(gain);
       gain.connect(dynamics);
       osc.start();
       break;
  }

  return offlineCtx.startRendering();
}

// --- CONFIGURATION ---
const TRACKS_CONFIG = [
  { id: 0, name: 'KICK', type: 'Kick' },
  { id: 1, name: 'SNARE', type: 'Snare' },
  { id: 2, name: 'CLAP', type: 'Clap' },
  { id: 3, name: 'CH', type: 'HiHat' },
  { id: 4, name: 'OH', type: 'OpenHat' },
  { id: 5, name: 'L TOM', type: 'Tom' },
  { id: 6, name: 'H TOM', type: 'Tom' }, // Will pitch shift this
  { id: 7, name: 'CRASH', type: 'Crash' },
  { id: 8, name: 'ZAP', type: 'Zap' },
  { id: 9, name: 'PERC 1', type: 'Tom' },
  { id: 10, name: 'PERC 2', type: 'Snare' },
  { id: 11, name: 'PERC 3', type: 'Zap' },
];

const STEPS = 16;
const PATTERNS = 4;

export default function DrumMachine() {
  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<{[key: string]: AudioBuffer}>({});
  const nextNoteTimeRef = useRef(0.0);
  const currentStepRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);
  const lookahead = 25.0; // ms
  const scheduleAheadTime = 0.1; // s

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(128);
  const [currentStep, setCurrentStep] = useState(0);
  const [activePattern, setActivePattern] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [volume, setVolume] = useState(75); // Master volume
  
  // Data Structure: Patterns -> Tracks -> Steps
  // We also need track parameters (pitch, decay, vol) per track, per pattern ideally? 
  // For simplicity, track params are global or per pattern. Let's make them per track (global across patterns) for now to keep UI simple, 
  // but "Pages of beats" implies pattern data changes.
  
  const [patternData, setPatternData] = useState(() => {
    // Initialize 4 patterns, each with 12 tracks of 16 steps
    return Array(PATTERNS).fill(null).map(() => 
      Array(TRACKS_CONFIG.length).fill(null).map(() => Array(STEPS).fill(false))
    );
  });
  
  // Track parameters (Volume, Pitch, Decay)
  const [trackParams, setTrackParams] = useState(() => {
    return TRACKS_CONFIG.map(t => ({
      volume: 0.8,
      pitch: t.name === 'H TOM' ? 1.5 : (t.name === 'PERC 1' ? 2.0 : 1.0),
      decay: 1.0, // Multiplier for buffer duration
      pan: 0
    }));
  });

  // Song Mode (Play patterns in order)
  const [songMode, setSongMode] = useState(false);
  const [patternOrder, setPatternOrder] = useState([0, 1, 2, 3]);

  // Init Audio
  useEffect(() => {
    const initAudio = async () => {
      const ctx = createAudioContext();
      audioCtxRef.current = ctx;

      // Generate buffers
      const bufferPromises = TRACKS_CONFIG.map(async (track) => {
        if (!buffersRef.current[track.type]) {
           buffersRef.current[track.type] = await createDrumBuffer(ctx, track.type);
        }
      });
      await Promise.all(bufferPromises);
    };
    initAudio();

    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
    };
  }, []);

  // Scheduler
  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / bpm;
    const secondsPer16th = secondsPerBeat / 4; // 16th notes
    nextNoteTimeRef.current += secondsPer16th;
    currentStepRef.current = (currentStepRef.current + 1) % STEPS;
    
    // Handle Pattern Chaining in Song Mode
    if (songMode && currentStepRef.current === 0) {
      // Logic to switch pattern could go here, strictly visual sync is tricky without more complex state
      // For this implementation, we will stick to manual pattern switching or simple loop
    }
  }, [bpm, songMode]);

  const playSound = (buffer: AudioBuffer, time: number, params: any) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = params.pitch;

    const gainNode = ctx.createGain();
    gainNode.gain.value = params.volume * (volume / 100);

    // Apply decay (fake waveform adjustment) by ramping down gain earlier
    if (params.decay < 1.0) {
       const duration = buffer.duration * params.decay;
       gainNode.gain.setValueAtTime(params.volume, time);
       gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);
    }

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(time);
    
    // Stop source after decay to save resources
    source.stop(time + (buffer.duration * params.decay) + 0.1);
  };

  const scheduler = useCallback(() => {
    if (!audioCtxRef.current) return;
    
    while (nextNoteTimeRef.current < audioCtxRef.current.currentTime + scheduleAheadTime) {
      // Schedule sounds for the current step
      const stepIndex = currentStepRef.current;
      setCurrentStep(stepIndex); // Update UI

      // Check all tracks for triggers
      patternData[activePattern].forEach((trackSteps, trackIndex) => {
        if (trackSteps[stepIndex]) {
          const trackConfig = TRACKS_CONFIG[trackIndex];
          const buffer = buffersRef.current[trackConfig.type];
          const params = trackParams[trackIndex];
          if (buffer) {
            playSound(buffer, nextNoteTimeRef.current, params);
          }
        }
      });

      nextNote();
    }
    timerIDRef.current = window.setTimeout(scheduler, lookahead);
  }, [activePattern, patternData, trackParams, nextNote, bpm, volume]);

  useEffect(() => {
    if (isPlaying) {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      currentStepRef.current = 0;
      nextNoteTimeRef.current = audioCtxRef.current!.currentTime;
      scheduler();
    } else {
      if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
    }
  }, [isPlaying, scheduler]);

  // UI Handlers
  const toggleStep = (trackIndex: number, stepIndex: number) => {
    setPatternData(prev => {
      const newPatterns = [...prev];
      const newGrid = [...newPatterns[activePattern]];
      const newRow = [...newGrid[trackIndex]];
      newRow[stepIndex] = !newRow[stepIndex];
      newGrid[trackIndex] = newRow;
      newPatterns[activePattern] = newGrid;
      return newPatterns;
    });
  };

  const handleTrackParamChange = (param: string, value: number) => {
    setTrackParams(prev => {
      const newParams = [...prev];
      newParams[selectedTrack] = { ...newParams[selectedTrack], [param]: value };
      return newParams;
    });
  };

  const clearPattern = () => {
    setPatternData(prev => {
      const newPatterns = [...prev];
      newPatterns[activePattern] = Array(TRACKS_CONFIG.length).fill(null).map(() => Array(STEPS).fill(false));
      return newPatterns;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono p-4 md:p-8 flex flex-col items-center">
      
      {/* HEADER / TRANSPORT */}
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 shadow-2xl shadow-cyan-900/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <div className="text-2xl font-bold text-white tracking-tighter">CYBER<span className="text-cyan-500">DRUM</span></div>
           <div className="h-8 w-px bg-slate-700 mx-2"></div>
           
           <button 
             onClick={() => setIsPlaying(!isPlaying)}
             className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all ${isPlaying ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' : 'bg-slate-800 text-cyan-500 hover:bg-slate-700'}`}
           >
             {isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
             {isPlaying ? 'STOP' : 'PLAY'}
           </button>

           <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
             <Activity size={16} className="text-slate-400" />
             <input 
               type="number" 
               value={bpm} 
               onChange={(e) => setBpm(Number(e.target.value))}
               className="bg-transparent w-16 text-center text-white focus:outline-none"
             />
             <span className="text-xs text-slate-500">BPM</span>
           </div>
        </div>

        <div className="flex items-center gap-6">
           {/* Master Volume */}
           <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-slate-400" />
              <input 
                type="range" 
                min="0" max="100" 
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-24 accent-cyan-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
           </div>
           
           <button 
             onClick={clearPattern}
             className="p-2 text-slate-400 hover:text-red-400 transition-colors" 
             title="Clear Pattern"
           >
             <RefreshCw size={18} />
           </button>
        </div>
      </div>

      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6">
        
        {/* MAIN SEQUENCER GRID */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl overflow-x-auto">
           {/* Grid Header (Step Numbers) */}
           <div className="flex mb-2 ml-[80px]">
              {Array(STEPS).fill(0).map((_, i) => (
                <div key={i} className={`flex-1 text-center text-[10px] ${i % 4 === 0 ? 'text-slate-300 font-bold' : 'text-slate-600'}`}>
                  {i + 1}
                </div>
              ))}
           </div>

           {/* Tracks */}
           <div className="space-y-1">
             {TRACKS_CONFIG.map((track, trackIndex) => (
               <div key={track.id} className="flex items-center gap-2 h-8">
                 {/* Track Label */}
                 <button 
                   onClick={() => setSelectedTrack(trackIndex)}
                   className={`w-[80px] text-xs font-bold text-left px-2 py-1 rounded transition-colors truncate
                     ${selectedTrack === trackIndex ? 'bg-cyan-900/50 text-cyan-400 border-l-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}
                   `}
                 >
                   {track.name}
                 </button>

                 {/* Steps */}
                 <div className="flex-1 flex gap-1 h-full">
                   {patternData[activePattern][trackIndex].map((isActive, stepIndex) => {
                     const isCurrent = currentStep === stepIndex && isPlaying;
                     // Logic for coloring: 
                     // Active step = Cyan
                     // Current playing step = White overlay
                     // Every 4th step = slightly lighter background for guide
                     return (
                       <button
                         key={stepIndex}
                         onClick={() => toggleStep(trackIndex, stepIndex)}
                         className={`
                           flex-1 rounded-sm transition-all duration-75 border border-transparent
                           ${isActive 
                             ? (isCurrent ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]') 
                             : (isCurrent ? 'bg-slate-600' : (stepIndex % 4 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'))
                           }
                           hover:border-cyan-500/30
                         `}
                       />
                     );
                   })}
                 </div>
               </div>
             ))}
           </div>
        </div>

        {/* SIDEBAR: PATTERNS & TRACK CONTROLS */}
        <div className="w-full lg:w-64 flex flex-col gap-6">
          
          {/* Pattern Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
             <div className="flex items-center gap-2 text-sm text-slate-400 mb-4 font-bold uppercase tracking-wider">
               <Layers size={14} /> Pattern
             </div>
             <div className="grid grid-cols-4 gap-2">
               {['A', 'B', 'C', 'D'].map((p, i) => (
                 <button
                   key={p}
                   onClick={() => setActivePattern(i)}
                   className={`
                     aspect-square rounded-lg font-bold text-sm transition-all border
                     ${activePattern === i 
                       ? 'bg-cyan-500 text-white border-cyan-400 shadow-lg shadow-cyan-500/20' 
                       : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                     }
                   `}
                 >
                   {p}
                 </button>
               ))}
             </div>
             {/* Simple Song Mode Toggle (Visual Only for this demo) */}
             <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
               <span>Chain Mode</span>
               <div 
                 onClick={() => setSongMode(!songMode)}
                 className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${songMode ? 'bg-cyan-500' : 'bg-slate-700'}`}
               >
                 <div className={`w-2 h-2 bg-white rounded-full mt-1 ml-1 transition-transform ${songMode ? 'translate-x-4' : ''}`}></div>
               </div>
             </div>
          </div>

          {/* Track Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1">
             <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2 text-sm text-slate-400 font-bold uppercase tracking-wider">
                 <Sliders size={14} /> Sound Design
               </div>
               <span className="text-xs text-cyan-400 font-bold">{TRACKS_CONFIG[selectedTrack].name}</span>
             </div>

             <div className="space-y-6">
               {/* Pitch */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs text-slate-400">
                   <span>Pitch</span>
                   <span>{trackParams[selectedTrack].pitch.toFixed(2)}x</span>
                 </div>
                 <input 
                   type="range" min="0.1" max="3.0" step="0.05"
                   value={trackParams[selectedTrack].pitch}
                   onChange={(e) => handleTrackParamChange('pitch', parseFloat(e.target.value))}
                   className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                 />
               </div>

               {/* Decay (Waveform Adjustment) */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs text-slate-400">
                   <span>Decay (Shape)</span>
                   <span>{Math.round(trackParams[selectedTrack].decay * 100)}%</span>
                 </div>
                 <input 
                   type="range" min="0.1" max="2.0" step="0.1"
                   value={trackParams[selectedTrack].decay}
                   onChange={(e) => handleTrackParamChange('decay', parseFloat(e.target.value))}
                   className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                 />
               </div>

               {/* Volume */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs text-slate-400">
                   <span>Track Vol</span>
                   <span>{Math.round(trackParams[selectedTrack].volume * 100)}%</span>
                 </div>
                 <input 
                   type="range" min="0" max="1.5" step="0.1"
                   value={trackParams[selectedTrack].volume}
                   onChange={(e) => handleTrackParamChange('volume', parseFloat(e.target.value))}
                   className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                 />
               </div>
             </div>
             
             {/* Visualizer / Waveform Graphic (Static Representation) */}
             <div className="mt-8 h-16 bg-slate-800 rounded-lg overflow-hidden flex items-end justify-center gap-[2px] opacity-50">
                {Array(20).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1 bg-cyan-500/50" 
                    style={{ 
                      height: `${Math.random() * 100}%`,
                      opacity: Math.max(0.2, 1 - (i / 10))
                    }}
                  />
                ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
