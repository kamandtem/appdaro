import React, { useState } from 'react';
import { FamilyMember } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { Users, Plus, CheckCircle2, Clock, AlertCircle, Heart, Shield, Sparkles } from 'lucide-react';

interface FamilyViewProps {
  members: FamilyMember[];
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  onAddMember: (member: FamilyMember) => void;
}

export const FamilyView: React.FC<FamilyViewProps> = ({
  members,
  selectedProfileId,
  onSelectProfile,
  onAddMember
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState<'مادر' | 'پدر' | 'کودک' | 'همسر' | 'پدربزرگ'>('مادر');

  const relations: { id: 'مادر' | 'پدر' | 'کودک' | 'همسر' | 'پدربزرگ'; label: string; color: string; bg: string }[] = [
    { id: 'مادر', label: 'مادر', color: '#10b981', bg: 'from-emerald-500 to-teal-600' },
    { id: 'پدر', label: 'پدر', color: '#f59e0b', bg: 'from-amber-500 to-orange-600' },
    { id: 'کودک', label: 'کودک / فرزند', color: '#ec4899', bg: 'from-pink-500 to-rose-600' },
    { id: 'همسر', label: 'همسر', color: '#8b5cf6', bg: 'from-purple-500 to-indigo-600' },
    { id: 'پدربزرگ', label: 'پدربزرگ / مادربزرگ', color: '#06b6d4', bg: 'from-cyan-500 to-blue-600' }
  ];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const selectedRel = relations.find(r => r.id === newRelation) || relations[0];

    const newMember: FamilyMember = {
      id: 'member_' + Math.random().toString(36).substring(2, 9),
      name: newName.trim(),
      relation: newRelation,
      avatarColor: selectedRel.color,
      bgGradient: selectedRel.bg,
      todayStatus: 'completed',
      todayStatusText: `${newName.trim()} هنوز برنامه امروز را آغاز نکرده است ⏰`,
      adherenceRate: 100
    };

    onAddMember(newMember);
    setNewName('');
    setShowAddModal(false);
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-4 px-3 sm:px-4 pb-24 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 text-xl sm:text-2xl">
            <Heart className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            <span>حالت خانواده (مدیریت داروی عزیزان)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            پیگیری زنده وضعیت مصرف داروهای والدین، سالمندان و کودکان با قابلیت جابجایی سریع
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/25 hover:scale-105 active:scale-95 transition-all px-4 py-2.5 text-xs sm:text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>افزودن عضو خانواده</span>
        </button>
      </div>

      {/* FAMILY HERO STATUS FEED */}
      <div className="bg-gradient-to-br from-rose-500 via-pink-600 to-purple-700 rounded-[32px] p-6 sm:p-8 text-white shadow-xl shadow-rose-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2 text-rose-200 text-xs font-bold mb-3">
          <Shield className="w-4 h-4" />
          <span>گزارش لحظه‌ای مراقبت خانواده</span>
        </div>
        <h3 className="font-black tracking-tight mb-2 text-xl sm:text-2xl">
          مامان امروز دارویش را مصرف کرده ✅
        </h3>
        <p className="text-xs sm:text-sm text-rose-100 font-medium max-w-lg leading-relaxed">
          شما در حال حاضر به عنوان سرپرست خانواده، بر سلامت و نظم دارویی {toPersianNumbers(members.length)} نفر از عزیزانتان نظارت دارید.
        </p>
      </div>

      {/* MEMBERS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {members.map((member) => {
          const isSelected = selectedProfileId === member.id;

          return (
            <div
              key={member.id}
              onClick={() => {
                onSelectProfile(member.id);
              }}
              className={`group bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-6 border-2 transition-all cursor-pointer shadow-xl hover:shadow-2xl hover:bg-white/60 dark:hover:bg-slate-900/70 relative overflow-hidden ${
                isSelected
                  ? 'border-teal-500 ring-4 ring-teal-500/20 bg-teal-50/40 dark:bg-teal-950/40'
                  : 'border-white/50 dark:border-slate-700/50 hover:border-teal-400'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-14 h-14 rounded-3xl flex items-center justify-center text-white text-xl font-black shadow-md shrink-0 border border-white/40"
                    style={{ backgroundColor: member.avatarColor }}
                  >
                    {member.relation[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-800 dark:text-white text-lg">
                        {member.name}
                      </h4>
                      {isSelected && (
                        <span className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                          انتخاب شده
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
                      نسبت: {member.relation}
                    </span>
                  </div>
                </div>

                {/* Adherence Rate badge */}
                <div className="text-left">
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 block">
                    {toPersianNumbers(member.adherenceRate)}٪
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">پایبندی</span>
                </div>
              </div>

              {/* Status Feed Box inside card */}
              <div className={`p-3.5 rounded-2xl border flex items-center gap-2.5 transition-colors backdrop-blur-sm ${
                member.todayStatus === 'completed'
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50/80 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
              }`}>
                {member.todayStatus === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-bold truncate">
                  {member.todayStatusText}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>کلیک برای مدیریت داروهای {member.name}</span>
                <span className="text-teal-600 dark:text-teal-400 group-hover:translate-x-[-4px] transition-transform">← ورود</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD MEMBER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-[40px] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-500" />
                <span>افزودن عضو جدید خانواده</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  نام و نام خانوادگی عضو خانواده:
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: طاهره رضایی (مادر)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  نسبت با شما:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {relations.map(r => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setNewRelation(r.id)}
                      className={`p-3 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 ${
                        newRelation === r.id
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-sm scale-105'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/3 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold rounded-2xl text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 bg-gradient-to-r from-rose-600 to-pink-600 text-white font-black rounded-2xl shadow-lg shadow-rose-500/25 text-sm"
                >
                  ثبت در خانواده داروتو
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
