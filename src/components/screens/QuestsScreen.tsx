import { useEffect, useState } from "react";
import type { QuestView } from "../../game/models";

export function QuestsScreen({ quests, trackedId, onTrack, onClose }: {
  quests: QuestView[]; trackedId: string; onTrack: (id: string) => void; onClose: () => void;
}) {
  const [prevTrackedId, setPrevTrackedId] = useState(trackedId);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (trackedId !== prevTrackedId) {
      setPrevTrackedId(trackedId);
      setRefreshKey((k) => k + 1);
    }
  }, [trackedId, prevTrackedId]);
  void refreshKey;
  const main = quests.filter((q) => q.main);
  const side = quests.filter((q) => !q.main);
  const Row = ({ q }: { q: QuestView }) => {
    const isTracked = q.id === trackedId;
    return (
      <button
        onClick={() => { if (!q.done) onTrack(q.id); }}
        className={`w-full text-left px-3 py-2 border transition-colors cursor-pointer ${
          isTracked ? "border-[#c9a24b] bg-[#c9a24b14]" : q.done ? "border-[#2c3d4d] opacity-50" : "border-[#2c3d4d] hover:border-[#4a6a7a]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`font-display text-[13px] tracking-[0.12em] uppercase ${q.done ? "text-[#6e7f8d] line-through" : "text-[#dfe8f0]"}`}>{q.title}</span>
          {isTracked && <span className="text-[10px] font-bold tracking-widest text-[#e8c979] uppercase">ведёт</span>}
          {q.done && <span className="text-[10px] font-bold tracking-widest text-[#63d8c8] uppercase">сделано</span>}
        </div>
        <div className="mt-0.5 text-[11.5px] text-[#8fa0ae]">{q.desc}</div>
      </button>
    );
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04060acc] anim-fade-in p-3" onClick={onClose}>
      <div className="nord-panel nord-frame w-full max-w-[560px] max-h-[92%] overflow-y-auto px-5 py-5 anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl tracking-[0.25em] text-[#dfe8f0] uppercase text-shadow-carve">Журнал саги</div>
          <button className="text-[#6e7f8d] hover:text-[#dfe8f0] text-xl leading-none cursor-pointer" onClick={onClose}>✕</button>
        </div>
        <div className="mt-3 font-display text-[12px] tracking-[0.25em] text-[#c9a24b] uppercase">Путь саги</div>
        <div className="mt-1.5 space-y-1.5">
          {main.length ? main.map((q) => <Row key={q.id} q={q} />) : <div className="text-[12px] text-[#6e7f8d]">Сага ещё не началась…</div>}
        </div>
        <div className="mt-4 font-display text-[12px] tracking-[0.25em] text-[#8fd8e8] uppercase">Побочные тропы</div>
        <div className="mt-1.5 space-y-1.5">
          {side.length ? side.map((q) => <Row key={q.id} q={q} />) : (
            <div className="text-[12px] text-[#6e7f8d]">Пока тихо. Жители Нидов хранят свои просьбы — заговори с ними.</div>
          )}
        </div>
        <div className="mt-4 text-[10.5px] text-[#4a5a68] tracking-widest">КВЕСТЫ ВПИСЫВАЮТСЯ САМИ · КЛИК — СЛЕДИТЬ · <span className="kbd">Q</span>/<span className="kbd">ESC</span> ЗАКРЫТЬ</div>
      </div>
    </div>
  );
}