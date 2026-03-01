const fs = require('fs');
let c = fs.readFileSync('components/CoachModal.tsx', 'utf8');

const oldStr = `<button onClick={onClose} className="absolute top-8 right-8 z-[1100] p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 shadow-xl border border-slate-700 transition-all">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>`;

const newStr = `<div className="absolute top-8 right-8 z-[1100] flex gap-3">
          {godMode && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-4 bg-amber-500 hover:bg-amber-400 rounded-full text-slate-950 transition-all shadow-xl border border-amber-600"
              title="God Mode: Edit Coach"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          <button onClick={onClose} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 shadow-xl border border-slate-700 transition-all">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>`;

c = c.replace(oldStr, newStr);
fs.writeFileSync('components/CoachModal.tsx', c);
console.log('Replaced successfully');