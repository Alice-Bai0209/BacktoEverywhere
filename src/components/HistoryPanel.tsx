import { useState } from 'react';
import { useStore } from '../store';
import { format } from 'date-fns';
import { calculateDistance } from '../lib/utils';
import { Clock, MapPin, Trash2, X, AlertTriangle } from 'lucide-react';

export default function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { history, deleteTrip } = useStore();

  return (
    <div className="absolute inset-0 bg-[#151619] z-50 flex flex-col text-white">
      <div className="pt-12 pb-4 px-6 border-b border-white/10 flex justify-between items-center bg-[#1a1b1e]">
        <h2 className="text-2xl font-bold tracking-tight">历史记录</h2>
        <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {history.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <MapPin size={48} className="mx-auto mb-4 opacity-20" />
            <p className="tracking-widest uppercase text-sm">暂无历史记录</p>
          </div>
        ) : (
          history.map(trip => {
            let distance = 0;
            if (trip.points.length > 1) {
              for (let i = 1; i < trip.points.length; i++) {
                distance += calculateDistance(
                  trip.points[i-1].lat,
                  trip.points[i-1].lng,
                  trip.points[i].lat,
                  trip.points[i].lng
                );
              }
            }
            
            const duration = trip.endTime ? Math.round((trip.endTime - trip.startTime) / 60000) : 0;

            return (
              <div key={trip.id} className="bg-[#1a1b1e] border border-white/5 p-5 rounded-2xl">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-white text-lg">{trip.name}</h3>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      {format(new Date(trip.startTime), 'yyyy-MM-dd HH:mm')}
                    </p>
                  </div>
                  <button 
                    onClick={() => deleteTrip(trip.id)}
                    className="text-red-500/70 hover:text-red-500 p-2 bg-red-500/10 rounded-xl transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div className="flex gap-6 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-blue-400" />
                    <span className="font-mono">{(distance / 1000).toFixed(2)} km</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-green-400" />
                    <span className="font-mono">{duration} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle size={14} />
                    <span className="font-mono">{trip.points.filter(p => p.risk).length}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
