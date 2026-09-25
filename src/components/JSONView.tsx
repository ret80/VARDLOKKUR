import React, { useState } from 'react';

interface JSONViewProps {
  data: any;
  name?: string;
  depth?: number;
  maxDepth?: number;
}

export function JSONView({ data, name, depth = 0, maxDepth = 5 }: JSONViewProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const isExpandable = data !== null && typeof data === 'object' && depth < maxDepth;
  const isArray = Array.isArray(data);

  const renderValue = (val: any) => {
    if (val === null) return <span className="text-[#e06060]">null</span>;
    if (typeof val === 'boolean') return <span className="text-[#c9a24b]">{String(val)}</span>;
    if (typeof val === 'number') return <span className="text-[#8fd8e8]">{val}</span>;
    if (typeof val === 'string') return <span className="text-[#a8e6a3]">"{val}"</span>;
    return <span className="text-[#ffffff]">{String(val)}</span>;
  };

  if (!isExpandable) {
    return (
      <div className="ml-2 font-mono text-[10px] leading-4">
        {name && <span className="text-[#ffffff]">{name}: </span>}
        {renderValue(data)}
      </div>
    );
  }

  const keys = Object.keys(data);
  const count = isArray ? data.length : keys.length;

  return (
    <div className="font-mono text-[10px] leading-4">
      <div
        className="flex items-center cursor-pointer hover:bg-[#1a3a4a] rounded px-1 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[#ffffff] w-3 text-center select-none">{expanded ? '▼' : '▶'}</span>
        {name && <span className="text-[#ffffff] mr-1">{name}: </span>}
        <span className="text-[#8fa0ae]">
          {isArray ? `Array(${count})` : `Object {${count}}`}
        </span>
      </div>
      {expanded && (
        <div className="ml-3 border-l border-[#2c3d4d] pl-1">
          {isArray
            ? data.map((item, index) => (
                <JSONView key={index} data={item} depth={depth + 1} maxDepth={maxDepth} />
              ))
            : keys.map((key) => (
                <JSONView key={key} data={data[key]} name={key} depth={depth + 1} maxDepth={maxDepth} />
              ))}
        </div>
      )}
    </div>
  );
}
