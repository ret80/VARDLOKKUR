import { useRef, useEffect, useState, useCallback } from "react";

interface SettingsScreenProps {
  onClose: () => void;
  eng: () => any;
}

/** Стиль для кастомного range-ползунка в Nordic-теме */
const sliderStyle: React.CSSProperties = {
  WebkitAppearance: "none",
  appearance: "none",
  width: "100%",
  height: 6,
  borderRadius: 3,
  background: "#1e3a4a",
  outline: "none",
  cursor: "pointer",
};

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  const fill = `linear-gradient(to right, #8fd8e8 0%, #8fd8e8 ${pct}%, #1e3a4a ${pct}%, #1e3a4a 100%)`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] tracking-[0.15em] text-[#8fa0ae] uppercase">{label}</label>
        <span className="text-[12px] font-bold text-[#8fd8e8] tabular-nums">{pct}%</span>
      </div>
      <div className="relative h-4 flex items-center">
        <div
          className="absolute inset-x-0 h-1.5 rounded-full"
          style={{ ...sliderStyle, background: fill }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          style={sliderStyle}
          className="relative z-10 [&::-webkit-slider-thumb]:!w-4 [&::-webkit-slider-thumb]:!h-4 [&::-webkit-slider-thumb]:!rounded [&::-webkit-slider-thumb]:!-mt-[4px]"
        />
      </div>
    </div>
  );
}

export function SettingsScreen({ onClose, eng }: SettingsScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [soundVolume, setSoundVolume] = useState(0.8);

  // При монтировании — считываем актуальные значения из engine
  const syncFromEngine = useCallback(() => {
    const e = eng();
    if (e) {
      setMusicVolume(e.musicVol ?? 0.7);
      setSoundVolume(e.soundVol ?? 0.8);
    }
  }, [eng]);

  useEffect(() => {
    syncFromEngine();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [syncFromEngine, onClose]);

  const handleMusicVolume = useCallback((v: number) => {
    setMusicVolume(v);
    eng()?.setMusicVolume(v);
  }, [eng]);

  const handleSoundVolume = useCallback((v: number) => {
    setSoundVolume(v);
    eng()?.setSoundVolume(v);
  }, [eng]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#04060acc] anim-fade-in p-4">
      <div className="nord-panel nord-frame w-full max-w-[480px] flex flex-col max-h-[85vh]">
        {/* Заголовок */}
        <div className="px-6 pt-6 pb-3 text-center shrink-0">
          <div className="font-display text-2xl tracking-[0.3em] text-[#dfe8f0] uppercase text-shadow-carve">
            Настройки
          </div>
          <div className="mt-1 text-center text-[12px] tracking-widest text-[#6e7f8d]">
            настройте звук саги
          </div>
        </div>

        {/* Скроллящийся контейнер с ползунками */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-2 space-y-6"
        >
          <VolumeSlider
            label="᛫ Громкость музыки"
            value={musicVolume}
            onChange={handleMusicVolume}
          />
          <VolumeSlider
            label="᛫ Громкость звуков"
            value={soundVolume}
            onChange={handleSoundVolume}
          />
        </div>

        {/* Статичная кнопка «Назад» внизу */}
        <div className="px-6 pb-6 pt-4 text-center shrink-0 border-t border-[#2c3d4d] mt-2">
          <button className="btn-rune btn-ice text-[13px]" onClick={onClose}>
            ← Назад
          </button>
        </div>
      </div>
    </div>
  );
}
