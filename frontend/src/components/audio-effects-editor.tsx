import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Gauge, MoveHorizontal, Phone, RadioTower, Repeat2, SlidersHorizontal, Waves, Zap, type LucideIcon } from 'lucide-react';
import { OperatorInspectorSection } from './operator-inspector-section';
import { OperatorIconButton } from './operator-action';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import type { AudioEffect } from '../lib/audio-effects';
import './audio-effects-editor.css';
type EffectsProps = {
    effects: AudioEffect[];
    disabled?: boolean;
    subject?: "Clip" | "Part";
    renderSupported?: boolean;
    locale?: "en" | "fr" | "ar" | "id";
    onPreview?: (effects: AudioEffect[]) => void;
    onCommit: (effects: AudioEffect[]) => void;
};
function effectId() { return crypto.randomUUID(); }
const EFFECT_LABELS: Record<AudioEffect["type"], string> = {
    telephone: "Telephone", echo: "Echo", filter: "Filter", compressor: "Compressor",
    reverb: "Reverb", distortion: "Distortion", pan: "Stereo Pan",
};
const EFFECT_ICONS: Record<AudioEffect["type"], LucideIcon> = {
    telephone: Phone,
    echo: Repeat2,
    filter: SlidersHorizontal,
    compressor: Gauge,
    reverb: Waves,
    distortion: Zap,
    pan: MoveHorizontal,
};
function newEffect(type: AudioEffect["type"]): AudioEffect {
    const shared = { id: effectId(), enabled: true };
    if (type === "telephone")
        return { ...shared, type };
    if (type === "echo")
        return { ...shared, type, delay_ms: 180, feedback: .28, mix: .22 };
    if (type === "filter")
        return { ...shared, type, mode: "lowpass", frequency_hz: 3400, q: .707 };
    if (type === "compressor")
        return { ...shared, type, threshold_db: -18, ratio: 4, attack_ms: 12, release_ms: 180, makeup_db: 0 };
    if (type === "reverb")
        return { ...shared, type, room_size: .45, mix: .2 };
    if (type === "distortion")
        return { ...shared, type, amount: .2, mix: .25 };
    return { ...shared, type: "pan", pan: 0 };
}
function presetEffects(preset: string): AudioEffect[] {
    const effect = <T extends AudioEffect["type"]>(type: T, changes: object = {}) => ({ ...newEffect(type), ...changes } as Extract<AudioEffect, {
        type: T;
    }>);
    if (preset === "telephone")
        return [effect("telephone")];
    if (preset === "radio")
        return [effect("telephone"), effect("compressor", { threshold_db: -20, ratio: 5 }), effect("distortion", { amount: .12, mix: .12 })];
    if (preset === "walkie")
        return [effect("telephone"), effect("compressor", { threshold_db: -24, ratio: 7 }), effect("distortion", { amount: .32, mix: .28 })];
    if (preset === "intercom")
        return [effect("telephone"), effect("compressor", { threshold_db: -22, ratio: 5 }), effect("reverb", { room_size: .18, mix: .12 })];
    if (preset === "behind-door")
        return [effect("filter", { mode: "lowpass", frequency_hz: 1100 }), effect("reverb", { room_size: .32, mix: .18 })];
    if (preset === "next-room")
        return [effect("filter", { mode: "lowpass", frequency_hz: 1800 }), effect("reverb", { room_size: .48, mix: .25 })];
    if (preset === "small-room")
        return [effect("reverb", { room_size: .25, mix: .18 })];
    if (preset === "large-hall")
        return [effect("reverb", { room_size: .78, mix: .38 })];
    if (preset === "cave")
        return [effect("reverb", { room_size: 1, mix: .48 }), effect("echo", { delay_ms: 420, feedback: .34, mix: .16 })];
    if (preset === "old-speaker")
        return [effect("filter", { mode: "highpass", frequency_hz: 180 }), effect("distortion", { amount: .38, mix: .34 })];
    if (preset === "robot")
        return [effect("filter", { mode: "highpass", frequency_hz: 260, q: 2.4 }), effect("distortion", { amount: .52, mix: .48 }), effect("echo", { delay_ms: 90, feedback: .18, mix: .18 })];
    return [];
}
const TRANSLATIONS: Record<string, Record<string, string>> = {
    fr: { Effect: 'effet', Effects: 'Effets', Clip: 'Clip', Part: 'Partie', active: 'actifs', 'None active': 'Aucun actif', 'Active': 'Actif', 'Inactive': 'Inactif', 'Processing order': 'Ordre de traitement', 'Effect primitives': 'Effets audio', 'Telephone': 'Téléphone', 'Echo': 'Écho', 'Filter': 'Filtre', 'Compressor': 'Compresseur', 'Reverb': 'Réverbération', 'Distortion': 'Distorsion', 'Stereo Pan': 'Position stéréo', 'Apply a creative preset…': 'Appliquer un préréglage…', 'Radio': 'Radio', 'Walkie-talkie': 'Talkie-walkie', 'Intercom': 'Interphone', 'Behind a door': 'Derrière une porte', 'Next room': 'Pièce voisine', 'Small room': 'Petite pièce', 'Large hall': 'Grande salle', 'Cave': 'Grotte', 'Old speaker': 'Ancien haut-parleur', 'Robot': 'Robot', 'Low-pass': 'Passe-bas', 'High-pass': 'Passe-haut', 'Cutoff': 'Fréquence de coupure', 'Resonance': 'Résonance', 'Threshold': 'Seuil', 'Ratio': 'Ratio', 'Attack': 'Attaque', 'Release': 'Relâchement', 'Makeup': 'Gain de sortie', 'Echo delay': 'Délai de l’écho', 'Echo feedback': 'Répétition de l’écho', 'Echo mix': 'Mélange de l’écho', 'Room size': 'Taille de la pièce', 'Reverb mix': 'Mélange de réverbération', 'Drive': 'Intensité', 'Distortion mix': 'Mélange de distorsion', 'Position': 'Position', 'Centre': 'Centre', 'left': 'gauche', 'right': 'droite', 'Earlier': 'Plus tôt', 'Later': 'Plus tard', 'Telephone help': 'Bande vocale de 300 à 3400 Hz. Les préréglages ajoutent compression, espace ou texture.', 'Effects help': 'Chaîne non destructive enregistrée dans le Projet et utilisée pendant la lecture du montage.' },
    ar: { Effect: 'مؤثر', Effects: 'المؤثرات', Clip: 'المقطع', Part: 'الجزء', active: 'نشطة', 'None active': 'لا مؤثرات نشطة', 'Active': 'نشط', 'Inactive': 'غير نشط', 'Processing order': 'ترتيب المعالجة', 'Effect primitives': 'المؤثرات الصوتية', 'Telephone': 'هاتف', 'Echo': 'صدى', 'Filter': 'مرشح', 'Compressor': 'ضاغط', 'Reverb': 'ارتداد', 'Distortion': 'تشويه', 'Stereo Pan': 'موضع ستيريو', 'Apply a creative preset…': 'تطبيق إعداد جاهز…', 'Radio': 'راديو', 'Walkie-talkie': 'جهاز لاسلكي', 'Intercom': 'اتصال داخلي', 'Behind a door': 'خلف باب', 'Next room': 'غرفة مجاورة', 'Small room': 'غرفة صغيرة', 'Large hall': 'قاعة كبيرة', 'Cave': 'كهف', 'Old speaker': 'مكبر قديم', 'Robot': 'روبوت', 'Low-pass': 'تمرير منخفض', 'High-pass': 'تمرير مرتفع', 'Cutoff': 'تردد القطع', 'Resonance': 'الرنين', 'Threshold': 'العتبة', 'Ratio': 'النسبة', 'Attack': 'الهجوم', 'Release': 'التحرير', 'Makeup': 'كسب الخرج', 'Echo delay': 'تأخير الصدى', 'Echo feedback': 'تكرار الصدى', 'Echo mix': 'مزيج الصدى', 'Room size': 'حجم الغرفة', 'Reverb mix': 'مزيج الارتداد', 'Drive': 'الشدة', 'Distortion mix': 'مزيج التشويه', 'Position': 'الموضع', 'Centre': 'الوسط', 'left': 'يسار', 'right': 'يمين', 'Earlier': 'تقديم', 'Later': 'تأخير', 'Telephone help': 'نطاق صوت من 300 إلى 3400 هرتز. تضيف الإعدادات الجاهزة ضغطًا أو مساحة أو نسيجًا.', 'Effects help': 'سلسلة غير إتلافية محفوظة في المشروع وتستخدم في تشغيل التركيب.' },
    id: { Effect: 'efek', Effects: 'Efek', Clip: 'Klip', Part: 'Bagian', active: 'aktif', 'None active': 'Tidak ada efek aktif', 'Active': 'Aktif', 'Inactive': 'Tidak aktif', 'Processing order': 'Urutan pemrosesan', 'Effect primitives': 'Efek audio', 'Telephone': 'Telepon', 'Echo': 'Gema', 'Filter': 'Filter', 'Compressor': 'Kompresor', 'Reverb': 'Reverb', 'Distortion': 'Distorsi', 'Stereo Pan': 'Posisi stereo', 'Apply a creative preset…': 'Terapkan preset…', 'Radio': 'Radio', 'Walkie-talkie': 'Walkie-talkie', 'Intercom': 'Interkom', 'Behind a door': 'Di balik pintu', 'Next room': 'Ruang sebelah', 'Small room': 'Ruang kecil', 'Large hall': 'Aula besar', 'Cave': 'Gua', 'Old speaker': 'Speaker lama', 'Robot': 'Robot', 'Low-pass': 'Lolos rendah', 'High-pass': 'Lolos tinggi', 'Cutoff': 'Frekuensi batas', 'Resonance': 'Resonansi', 'Threshold': 'Ambang', 'Ratio': 'Rasio', 'Attack': 'Attack', 'Release': 'Release', 'Makeup': 'Gain keluaran', 'Echo delay': 'Jeda gema', 'Echo feedback': 'Pengulangan gema', 'Echo mix': 'Campuran gema', 'Room size': 'Ukuran ruang', 'Reverb mix': 'Campuran reverb', 'Drive': 'Intensitas', 'Distortion mix': 'Campuran distorsi', 'Position': 'Posisi', 'Centre': 'Tengah', 'left': 'kiri', 'right': 'kanan', 'Earlier': 'Lebih awal', 'Later': 'Lebih akhir', 'Telephone help': 'Rentang suara 300–3400 Hz. Preset menambahkan kompresi, ruang, atau tekstur.', 'Effects help': 'Rantai tanpa merusak sumber disimpan dalam Proyek dan digunakan saat memutar komposisi.' },
    en: { 'Telephone help': 'Focused 300–3400 Hz voice band. Use a preset when you also want compression, room or texture.', 'Effects help': 'This non-destructive chain is saved with the Project and used by composition playback.' }
};
export function SoundEffectsEditor({ effects, disabled, subject = "Clip", renderSupported = true, locale = "en", onPreview, onCommit }: EffectsProps) {
    const t = (label: string) => TRANSLATIONS[locale]?.[label] ?? label;
    const [draft, setDraft] = useState(effects);
    const [preset, setPreset] = useState("");
    const [focusedType, setFocusedType] = useState<AudioEffect["type"] | null>(effects.find((effect) => effect.enabled)?.type || null);
    useEffect(() => {
        setDraft(effects);
        setPreset("");
        setFocusedType((current) => effects.some((effect) => effect.type === current && effect.enabled)
            ? current : effects.find((effect) => effect.enabled)?.type || null);
    }, [effects]);
    function toggle(type: AudioEffect["type"]) {
        const existing = draft.find((effect) => effect.type === type);
        const next = existing
            ? draft.map((effect) => effect.id === existing.id ? { ...effect, enabled: !effect.enabled } : effect)
            : [...draft, newEffect(type)];
        setDraft(next);
        setPreset("");
        setFocusedType(type);
        onPreview?.(next);
        onCommit(next);
    }
    function change(type: AudioEffect["type"], changes: object, commit = false) {
        const next = draft.map((effect) => effect.type === type ? { ...effect, ...changes } as AudioEffect : effect);
        setDraft(next);
        setPreset("");
        if (commit)
            onCommit(next);
        else
            onPreview?.(next);
    }
    function applyPreset(preset: string) {
        const next = presetEffects(preset);
        setDraft(next);
        setPreset(preset);
        setFocusedType(next[0]?.type || null);
        onPreview?.(next);
        onCommit(next);
    }
    function move(effectId: string, direction: -1 | 1) {
        const index = draft.findIndex((effect) => effect.id === effectId);
        const activeIds = draft.filter(effect => effect.enabled).map(effect => effect.id);
        const activeIndex = activeIds.indexOf(effectId);
        const adjacent = activeIds[activeIndex + direction];
        const destination = draft.findIndex(effect => effect.id === adjacent);
        if (disabled || index < 0 || destination < 0)
            return;
        const next = [...draft];
        [next[index], next[destination]] = [next[destination]!, next[index]!];
        setDraft(next);
        setPreset("");
        onPreview?.(next);
        onCommit(next);
    }
    const active = draft.filter((effect) => effect.enabled);
    const focused = draft.find((effect) => effect.type === focusedType && effect.enabled) || null;
    const effectTypes = Object.keys(EFFECT_LABELS) as AudioEffect["type"][];
    return <OperatorInspectorSection icon={RadioTower} title={locale === "en" ? `${subject} effects` : `${t("Effects")} · ${t(subject)}`} meta={active.length ? `${active.length} ${t("active")}` : t("None active")} metaTechnical help={renderSupported && locale === "en" ? "This non-destructive chain is used by browser playback and final export." : t("Effects help")} className="sound-effects-editor">
    <Select value={preset} onValueChange={applyPreset} disabled={disabled}><SelectTrigger className="sound-effect-preset"><SelectValue placeholder={t("Apply a creative preset…")}/></SelectTrigger><SelectContent>
      <SelectItem value="telephone">{t("Telephone")}</SelectItem><SelectItem value="radio">{t("Radio")}</SelectItem><SelectItem value="walkie">{t("Walkie-talkie")}</SelectItem><SelectItem value="intercom">{t("Intercom")}</SelectItem>
      <SelectItem value="behind-door">{t("Behind a door")}</SelectItem><SelectItem value="next-room">{t("Next room")}</SelectItem><SelectItem value="small-room">{t("Small room")}</SelectItem><SelectItem value="large-hall">{t("Large hall")}</SelectItem><SelectItem value="cave">{t("Cave")}</SelectItem><SelectItem value="old-speaker">{t("Old speaker")}</SelectItem><SelectItem value="robot">{t("Robot")}</SelectItem>
    </SelectContent></Select>
    <div className="sound-effect-palette" aria-label={t("Effect primitives")}>{effectTypes.map((type) => {
            const enabled = Boolean(draft.find((effect) => effect.type === type)?.enabled);
            const EffectIcon = EFFECT_ICONS[type];
            return <button key={type} type="button" aria-label={`${t(EFFECT_LABELS[type])} ${t("Effect").toLowerCase()} · ${enabled ? t("Active") : t("Inactive")}`} aria-pressed={enabled} disabled={disabled} onClick={() => toggle(type)} onFocus={() => setFocusedType(type)}><EffectIcon /><span>{t(EFFECT_LABELS[type])}</span>{enabled && <Check className="sound-effect-active-check"/>}</button>;
        })}</div>
    {active.length > 0 && <div className="sound-effect-chain" aria-label={locale === "en" ? "Effect processing order" : t("Processing order")}>
      <span>{t("Processing order")}</span>
      <ol>{active.map((effect, index) => <li key={effect.id}>
        <b>{index + 1}</b><button type="button" onClick={() => setFocusedType(effect.type)}>{t(EFFECT_LABELS[effect.type])}</button>
        <OperatorIconButton type="button" label={locale === "en" ? `Move ${effect.type} earlier in the effect chain` : `${t("Earlier")} · ${t(EFFECT_LABELS[effect.type])}`} disabled={disabled || index === 0} onClick={() => move(effect.id, -1)}><ArrowUp /></OperatorIconButton>
        <OperatorIconButton type="button" label={locale === "en" ? `Move ${effect.type} later in the effect chain` : `${t("Later")} · ${t(EFFECT_LABELS[effect.type])}`} disabled={disabled || index === active.length - 1} onClick={() => move(effect.id, 1)}><ArrowDown /></OperatorIconButton>
      </li>)}</ol>
    </div>}
    {focused && <div className="sound-effect-controls"><strong>{t(EFFECT_LABELS[focused.type])}</strong>
      {focused.type === "telephone" && <p>{t("Telephone help")}</p>}
      {focused.type === "filter" && <><div className="sound-filter-mode"><button type="button" disabled={disabled} aria-pressed={focused.mode === "lowpass"} onClick={() => change("filter", { mode: "lowpass" }, true)}>{t("Low-pass")}</button><button type="button" disabled={disabled} aria-pressed={focused.mode === "highpass"} onClick={() => change("filter", { mode: "highpass" }, true)}>{t("High-pass")}</button></div><EffectSlider disabled={disabled} label={t("Cutoff")} value={focused.frequency_hz} min={40} max={20000} step={10} format={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value} Hz`} onPreview={(value) => change("filter", { frequency_hz: value })} onCommit={(value) => change("filter", { frequency_hz: value }, true)}/><EffectSlider disabled={disabled} label={t("Resonance")} value={focused.q} min={.1} max={18} step={.1} format={(value) => value.toFixed(1)} onPreview={(value) => change("filter", { q: value })} onCommit={(value) => change("filter", { q: value }, true)}/></>}
      {focused.type === "compressor" && <><EffectSlider disabled={disabled} label={t("Threshold")} value={focused.threshold_db} min={-60} max={0} step={1} format={(value) => `${value} dB`} onPreview={(value) => change("compressor", { threshold_db: value })} onCommit={(value) => change("compressor", { threshold_db: value }, true)}/><EffectSlider disabled={disabled} label={t("Ratio")} value={focused.ratio} min={1} max={20} step={.5} format={(value) => `${value.toFixed(1)}:1`} onPreview={(value) => change("compressor", { ratio: value })} onCommit={(value) => change("compressor", { ratio: value }, true)}/><EffectSlider disabled={disabled} label={t("Attack")} value={focused.attack_ms} min={.1} max={1000} step={1} format={(value) => `${Math.round(value)} ms`} onPreview={(value) => change("compressor", { attack_ms: value })} onCommit={(value) => change("compressor", { attack_ms: value }, true)}/><EffectSlider disabled={disabled} label={t("Release")} value={focused.release_ms} min={10} max={3000} step={10} format={(value) => `${Math.round(value)} ms`} onPreview={(value) => change("compressor", { release_ms: value })} onCommit={(value) => change("compressor", { release_ms: value }, true)}/><EffectSlider disabled={disabled} label={t("Makeup")} value={focused.makeup_db} min={0} max={24} step={.5} format={(value) => `+${value.toFixed(1)} dB`} onPreview={(value) => change("compressor", { makeup_db: value })} onCommit={(value) => change("compressor", { makeup_db: value }, true)}/></>}
      {focused.type === "echo" && <><EffectSlider disabled={disabled} label={t("Echo delay")} value={focused.delay_ms} min={50} max={1000} step={10} format={(value) => `${value} ms`} onPreview={(value) => change("echo", { delay_ms: value })} onCommit={(value) => change("echo", { delay_ms: value }, true)}/><EffectSlider disabled={disabled} label={t("Echo feedback")} value={focused.feedback * 100} min={0} max={85} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("echo", { feedback: value / 100 })} onCommit={(value) => change("echo", { feedback: value / 100 }, true)}/><EffectSlider disabled={disabled} label={t("Echo mix")} value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("echo", { mix: value / 100 })} onCommit={(value) => change("echo", { mix: value / 100 }, true)}/></>}
      {focused.type === "reverb" && <><EffectSlider disabled={disabled} label={t("Room size")} value={focused.room_size * 100} min={10} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("reverb", { room_size: value / 100 })} onCommit={(value) => change("reverb", { room_size: value / 100 }, true)}/><EffectSlider disabled={disabled} label={t("Reverb mix")} value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("reverb", { mix: value / 100 })} onCommit={(value) => change("reverb", { mix: value / 100 }, true)}/></>}
      {focused.type === "distortion" && <><EffectSlider disabled={disabled} label={t("Drive")} value={focused.amount * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("distortion", { amount: value / 100 })} onCommit={(value) => change("distortion", { amount: value / 100 }, true)}/><EffectSlider disabled={disabled} label={t("Distortion mix")} value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("distortion", { mix: value / 100 })} onCommit={(value) => change("distortion", { mix: value / 100 }, true)}/></>}
      {focused.type === "pan" && <EffectSlider disabled={disabled} label={t("Position")} value={focused.pan * 100} min={-100} max={100} step={1} format={(value) => value === 0 ? t("Centre") : `${Math.abs(Math.round(value))}% ${value < 0 ? t("left") : t("right")}`} onPreview={(value) => change("pan", { pan: value / 100 })} onCommit={(value) => change("pan", { pan: value / 100 }, true)}/>}
    </div>}
  </OperatorInspectorSection>;
}
function EffectSlider({ disabled, label, value, min, max, step, format, onPreview, onCommit }: {
    disabled?: boolean;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
    onPreview: (value: number) => void;
    onCommit: (value: number) => void;
}) {
    return <label><span>{label}<b>{format(value)}</b></span><Slider disabled={disabled} aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([next = value]) => onPreview(next)} onValueCommit={([next = value]) => onCommit(next)}/></label>;
}
