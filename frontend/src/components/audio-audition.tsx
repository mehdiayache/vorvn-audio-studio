import {TextAction} from './text-action';
import {MediaTransportControls} from './ui/media-transport-controls';
import {useFileText} from './upload/file-locale';
import WaveformPlayer from '@arraypress/waveform-player/no-autoinit';
import '@arraypress/waveform-player/styles.css';
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { formatMediaTime as time } from "@/lib/media-time";
import "./audio-audition.css";

export const audioPlayerCopy = {
  en: {
    playLabel: "Play",
    pauseLabel: "Pause",
    errorLabel: "Audio could not be played",
    speedLabel: "Playback speed",
  },
  fr: {
    playLabel: "Écouter",
    pauseLabel: "Pause",
    errorLabel: "Impossible de lire cet audio",
    speedLabel: "Vitesse de lecture",
  },
  ar: {
    playLabel: "تشغيل",
    pauseLabel: "إيقاف مؤقت",
    errorLabel: "تعذر تشغيل الصوت",
    speedLabel: "سرعة التشغيل",
  },
  id: {
    playLabel: "Putar",
    pauseLabel: "Jeda",
    errorLabel: "Audio tidak dapat diputar",
    speedLabel: "Kecepatan pemutaran",
  },
};
import {claimMedia,releaseMedia,watchMediaVisibility} from '@/lib/media-playback';
import {filePreviewData} from '@/lib/file-preview-data';
type Props = {
  url: string;
  label: string;
  showLabel?: boolean;
  playLabel?: string;
  pauseLabel?: string;
  errorLabel?: string;
  speedLabel?: string;
  peaks?: number[];
  fileSurface?: boolean;
  waveform?: boolean;
  previewKey?: string;
  durationHint?: number;
  size?: "normal" | "mini" | "compact";
  disabled?: boolean;
  start?: number;
  end?: number;
  mediaRef?: Ref<HTMLAudioElement>;
  onDuration?: (seconds: number) => void;
  onError?: () => void;
};
/** The shared audio transport. Mini changes geometry, never playback behavior. */
export function AudioAudition(props: Props) {
  return <AudioPlayer key={props.url} {...props} />;
}
function AudioPlayer({
  url,
  label,
  showLabel = true,
  playLabel = "Play",
  pauseLabel = "Pause",
  errorLabel = "Audio could not be played",
  speedLabel,
  peaks: providedPeaks,
  fileSurface = false,
  waveform,
  previewKey,
  durationHint,
  size = "normal",
  disabled = false,
  start = 0,
  end,
  mediaRef,
  onDuration,
  onError,
}: Props) {
  const t=useFileText();
  const [muted,setMuted]=useState(false);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<WaveformPlayer | null>(null);
  const request = useRef(0);
  const wanted = useRef(false);
  const pending = useRef(false);
  const rejectLatePlay = useRef(false);
  const ref = useRef<HTMLAudioElement>(null),
    alive = useRef(true);
  const [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [loadedDuration, setDuration] = useState(0),
    [position, setPosition] = useState(start);
  const bindMedia = useCallback(
    (node: HTMLAudioElement | null) => {
      ref.current = node;
      if (typeof mediaRef === "function") mediaRef(node);
      else if (mediaRef) mediaRef.current = node;
    },
    [mediaRef],
  );
  const [decodedPeaks,setDecodedPeaks]=useState<number[]>();
  const [waveformFailed,setWaveformFailed]=useState(false);
  const [waveformRetry,setWaveformRetry]=useState(0);
  const [intent,setIntent]=useState(false);
  const peaks=providedPeaks??decodedPeaks;
  const lightweight = waveform === false;
  const visualWaveform = !lightweight && (size !== "compact" || fileSurface || waveform === true);
  useEffect(()=>{if(!visualWaveform||!ref.current)return;const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>setIntent(entries.some(entry=>entry.isIntersecting)));if(observer)observer.observe(ref.current.parentElement!);else setIntent(true);return()=>observer?.disconnect()},[visualWaveform]);
  useEffect(()=>{if(!visualWaveform||!intent||providedPeaks)return;const ctrl=new AbortController();setDecodedPeaks(undefined);setWaveformFailed(false);void filePreviewData(url,'audio',ctrl.signal,previewKey).then(value=>{if(!ctrl.signal.aborted)setDecodedPeaks(value as number[])}).catch(()=>{if(!ctrl.signal.aborted)setWaveformFailed(true)});return()=>ctrl.abort()},[url,previewKey,visualWaveform,intent,providedPeaks,waveformRetry]);
  useEffect(()=>{const hide=()=>{if(document.hidden)ref.current?.pause()};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[]);
  const duration=loadedDuration||(durationHint&&Number.isFinite(durationHint)&&durationHint>0?durationHint:0);
  const limit = Math.min(end ?? duration, duration || end || 0),
    length = Math.max(0, limit - start);
  useEffect(() => {
    alive.current = true;
    const audio = ref.current;
    const stop=audio?watchMediaVisibility(audio,audio.parentElement!):undefined;
    return () => {
      alive.current = false;
      stop?.();
      request.current++;
      wanted.current = false;
      if (audio) {
        audio.pause();
        releaseMedia(audio);
      }
    };
  }, []);
  useEffect(() => {
    const audio = ref.current;
    if (audio && (audio.currentTime < start || audio.currentTime > limit)) {
      audio.currentTime = start;
      setPosition(start);
    }
  }, [start, limit]);
  function pause() {
    rejectLatePlay.current = pending.current;
    request.current++;
    wanted.current = false;
    pending.current = false;
    ref.current?.pause();
    if (ref.current) releaseMedia(ref.current);
    setPlaying(false);
    setBusy(false);
  }
  async function toggle() {
    const audio = ref.current;
    if (!audio || disabled) return;
    if (pending.current || !audio.paused) { pause(); return; }
    const ticket = ++request.current;
    wanted.current = true;
    rejectLatePlay.current = false;
    pending.current = true;
    setError(false);
    setBusy(true);
    claimMedia(audio);
    if (lightweight && !audio.getAttribute("src")) audio.src = url;
    if (audio.currentTime < start || (limit && audio.currentTime >= limit)) audio.currentTime = start;
    try {
      await audio.play();
      if (!alive.current || (!wanted.current && ticket !== request.current)) audio.pause();
    } catch {
      if (alive.current && ticket === request.current && wanted.current) { setError(true); releaseMedia(audio); }
    } finally {
      if (alive.current && ticket === request.current) { pending.current = false; setBusy(false); }
    }
  }
  const callbacks = useRef({toggle, pause, disabled, start, length, limit});
  callbacks.current = {toggle, pause, disabled, start, length, limit};
  useEffect(() => {
    const element = host.current;
    if (!element || lightweight) return;
    const p = new WaveformPlayer(element, {
      audioMode: 'external', url, waveform: [0], waveformStyle: 'seekbar',
      height: 40, barWidth: 2, barSpacing: 4, barRadius: 4,
      showInfo: size !== 'compact', title: label,
      showTime: size !== 'compact', showPlaybackSpeed: size === 'normal' && !fileSurface,
      showHoverTime: size !== 'compact', showBPM: false, markers: [],
      buttonStyle: 'circle', buttonSize: 40, singlePlay: false,
      playOnSeek: false, enableMediaSession: false,
      accessibleSeek: size !== 'compact' || fileSurface,
      speedLabel: speedLabel ?? Object.values(audioPlayerCopy).find(copy => copy.playLabel === playLabel)?.speedLabel ?? audioPlayerCopy.en.speedLabel,
      seekLabel: label, seekValueText: '%1$s / %2$s', playPauseLabel: playLabel, errorText: errorLabel,
    });
    player.current = p;
    const applyColors = () => {
      // Canvas cannot resolve CSS variables itself. Read the resolved product
      // colors from this instance, including inherited member appearance.
      const canvasHost = element.querySelector<HTMLElement>('.waveform-container');
      const progressColor = getComputedStyle(element).color;
      const waveformColor = canvasHost ? getComputedStyle(canvasHost).color : '';
      if (progressColor) p.options.progressColor = progressColor;
      if (waveformColor) p.options.waveformColor = waveformColor;
      p.resizeCanvas();
    };
    const refreshTheme = p.refreshTheme.bind(p);
    p.refreshTheme = () => { refreshTheme(); applyColors(); };
    applyColors();
    const play = (event: Event) => { event.preventDefault(); void callbacks.current.toggle(); };
    const stop = (event: Event) => { event.preventDefault(); callbacks.current.pause(); };
    const seek = (event: CustomEvent<{percent: number}>) => {
      event.preventDefault();
      const c = callbacks.current;
      if (c.disabled || !c.length || !ref.current) return;
      const percent = event.detail.percent;
      if (!Number.isFinite(percent)) return;
      const next = c.start + Math.max(0, Math.min(1, percent)) * c.length;
      ref.current.currentTime = next;
      setPosition(next);
    };
    element.addEventListener('waveformplayer:request-play', play);
    element.addEventListener('waveformplayer:request-pause', stop);
    element.addEventListener('waveformplayer:request-seek', seek);
    // External mode delegates speed too. Keep the library's menu/focus handling,
    // while binding its public rate setter to the same real media element.
    p.setPlaybackRate = (rate: number) => {
      if (!ref.current || callbacks.current.disabled || !Number.isFinite(rate)) return;
      const next = Math.max(.25, Math.min(4, rate));
      ref.current.playbackRate = next;
      p.options.playbackRate = next;
      const button = element.querySelector('.speed-btn');
      if (button) button.textContent = `${next}x`;
      element.querySelectorAll<HTMLElement>('.speed-option').forEach(option => {
        const active = Number(option.dataset.rate) === next;
        option.classList.toggle('active', active);
        option.setAttribute('aria-checked', String(active));
      });
    };
    return () => {
      element.removeEventListener('waveformplayer:request-play', play);
      element.removeEventListener('waveformplayer:request-pause', stop);
      element.removeEventListener('waveformplayer:request-seek', seek);
      p.destroy();
      player.current = null;
    };
  }, [url, label, showLabel, size, fileSurface, lightweight, playLabel, errorLabel, speedLabel]);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.options.waveformStyle = peaks?.length ? 'bars' : 'seekbar';
    const displayedPeaks = peaks?.length && duration > 0 && (start > 0 || limit < duration)
      ? peaks.slice(Math.floor(start / duration * peaks.length), Math.max(Math.floor(start / duration * peaks.length) + 1, Math.ceil(limit / duration * peaks.length))) : peaks;
    p.setWaveformData(displayedPeaks?.length ? displayedPeaks : [0]);
    p.setPlayingState(playing || busy);
    p.setProgress(Math.max(0, position - start), length);
    const button = host.current?.querySelector<HTMLButtonElement>('.waveform-btn');
    if (button) {
      button.disabled = disabled;
      button.type = 'button';
      button.setAttribute('aria-busy', String(busy));
      button.setAttribute('aria-label', size === 'compact' ? `${playing || busy ? pauseLabel : playLabel} · ${label}` : playing || busy ? pauseLabel : playLabel);
    }
    const seek = host.current?.querySelector<HTMLElement>('[role="slider"]');
    if (seek) { seek.setAttribute('aria-disabled', String(disabled || !length)); seek.tabIndex = disabled || !length ? -1 : 0; }
    host.current?.querySelectorAll<HTMLButtonElement>('.speed-btn,.speed-option').forEach(button => {button.disabled = disabled; button.type = 'button';});
  }, [peaks, playing, busy, position, start, length, limit, duration, disabled, size, label, playLabel, pauseLabel]);
  useEffect(() => { if (disabled) pause(); }, [disabled]);
  return (
    <div className="audio-audition" data-file-surface={fileSurface} data-lightweight={lightweight||undefined} data-size={size} data-show-label={showLabel} data-duration-known={length > 0} aria-label={label} onPointerEnter={()=>setIntent(true)} onFocus={()=>setIntent(true)} onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
      <audio
        ref={bindMedia}
        muted={muted}
        src={lightweight?undefined:url}
        preload={visualWaveform&&intent?"metadata":"none"}
        onPlay={(event) => {
          if (rejectLatePlay.current || !alive.current) { event.currentTarget.pause(); return; }
          wanted.current = true;
          claimMedia(event.currentTarget);
          setPlaying(true);
        }}
        onPlaying={() => setBusy(false)}
        onWaiting={() => { if (wanted.current) setBusy(true); }}
        onCanPlay={() => setBusy(false)}
        onPause={() => {
          if (pending.current) rejectLatePlay.current = true;
          request.current++;
          wanted.current = false;
          pending.current = false;
          if (ref.current) releaseMedia(ref.current);
          if (!alive.current) return;
          setPlaying(false);
          setBusy(false);
        }}
        onEnded={() => { request.current++; wanted.current = false; pending.current = false; if (ref.current) releaseMedia(ref.current); setPlaying(false); setBusy(false); }}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) {
            setDuration(seconds);
            onDuration?.(seconds);
          }
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (end !== undefined && audio.currentTime >= end) {
            audio.pause();
            if (audio.currentTime > end) audio.currentTime = end;
          }
          setPosition(audio.currentTime);
        }}
        onError={() => {
          setBusy(false);
          setPlaying(false);
          setError(true);
          onError?.();
        }}
      />
      {lightweight?<MediaTransportControls playing={playing} busy={busy} muted={muted} disabled={disabled} position={Math.max(0,position-start)} duration={length} onPlay={()=>void toggle()} onMute={()=>setMuted(value=>!value)} playLabel={`${playLabel} · ${label}`} pauseLabel={`${pauseLabel} · ${label}`} muteLabel={t('Mute')} unmuteLabel={t('Unmute')}/>:<div className="audio-audition-native"><div ref={host} /></div>}
      {size === 'compact' && !lightweight && length > 0 && <time dir="ltr">{playing ? time(Math.max(0, position - start)) : time(length)}</time>}
      {waveformFailed && visualWaveform && <span className="audio-waveform-feedback"><span>{({en:'Waveform unavailable. Playback is still available.',fr:'Forme d’onde indisponible. La lecture reste disponible.',ar:'شكل الموجة غير متاح. لا يزال التشغيل متاحًا.',id:'Gelombang audio tidak tersedia. Audio tetap dapat diputar.'} as const)[Object.entries(audioPlayerCopy).find(([,copy])=>copy.playLabel===playLabel)?.[0] as keyof typeof audioPlayerCopy ?? 'en']}</span> <TextAction onClick={()=>setWaveformRetry(value=>value+1)}>{({en:'Retry',fr:'Réessayer',ar:'إعادة المحاولة',id:'Coba lagi'} as const)[Object.entries(audioPlayerCopy).find(([,copy])=>copy.playLabel===playLabel)?.[0] as keyof typeof audioPlayerCopy ?? 'en']}</TextAction></span>}
      {error && <span role="alert">{errorLabel}</span>}
    </div>
  );
}
