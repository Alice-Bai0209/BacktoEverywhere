import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, auth } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';

export interface Point {
  lat: number;
  lng: number;
  alt: number | null;
  time: number;
  risk?: string;
}

export interface Trip {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  points: Point[];
  userId?: string;
}

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  time: number;
  type: 'start' | 'end' | 'waypoint';
}

interface AppState {
  status: 'idle' | 'tracking' | 'returning' | 'completed';
  currentTrip: Trip | null;
  history: Trip[];
  checkpoints: SavedLocation[];
  isVoiceEnabled: boolean;
  isMountaineeringMode: boolean;
  returnMode: 'original' | 'shortcut';
  targetPointIndex: number;
  shortcutPath: Point[] | null;
  focusedLocation: [number, number] | null;
  locationPermissionGranted: boolean;
  
  setStatus: (status: 'idle' | 'tracking' | 'returning') => void;
  startTracking: () => void;
  addPoint: (point: Point) => void;
  stopTracking: () => void;
  startReturn: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setMountaineeringMode: (enabled: boolean) => void;
  setReturnMode: (mode: 'original' | 'shortcut') => void;
  setTargetPointIndex: (index: number) => void;
  setShortcutPath: (path: Point[] | null) => void;
  setFocusedLocation: (loc: [number, number] | null) => void;
  setLocationPermissionGranted: (granted: boolean) => void;
  saveCheckpoint: (loc: Omit<SavedLocation, 'id' | 'time'>) => void;
  clearCheckpoints: () => void;
  completeTrip: () => void;
  clearCurrentTrip: () => void;
  deleteTrip: (id: string) => void;
  syncHistoryFromFirebase: () => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      currentTrip: null,
      history: [],
      checkpoints: [],
      isVoiceEnabled: true,
      isMountaineeringMode: false,
      returnMode: 'original',
      targetPointIndex: -1,
      shortcutPath: null,
      focusedLocation: null,
      locationPermissionGranted: false,

      setStatus: (status) => set({ status }),
      
      startTracking: () => set({
        status: 'tracking',
        currentTrip: {
          id: Date.now().toString(),
          name: `Trip ${new Date().toLocaleDateString()}`,
          startTime: Date.now(),
          points: [],
          userId: auth.currentUser?.uid
        },
        targetPointIndex: -1,
        shortcutPath: null,
      }),

      addPoint: (point) => set((state) => {
        if (!state.currentTrip) return state;
        return {
          currentTrip: {
            ...state.currentTrip,
            points: [...state.currentTrip.points, point],
          }
        };
      }),

      stopTracking: () => {
        const state = get();
        if (!state.currentTrip) return;
        
        const finishedTrip = { ...state.currentTrip, endTime: Date.now() };
        
        // Sync to Firebase if logged in
        if (auth.currentUser) {
          const tripRef = doc(db, `users/${auth.currentUser.uid}/trips/${finishedTrip.id}`);
          // Don't save all points in the main doc to avoid 1MB limit, but for simplicity here we save it.
          // In production, points should be a subcollection if very large.
          setDoc(tripRef, finishedTrip).catch(e => console.error("Firebase save error", e));
        }

        set({
          status: 'idle',
          currentTrip: null,
          history: [finishedTrip, ...state.history],
          shortcutPath: null,
        });
      },

      startReturn: () => set((state) => {
        if (!state.currentTrip || state.currentTrip.points.length === 0) return state;
        return {
          status: 'returning',
          targetPointIndex: state.currentTrip.points.length - 1,
          shortcutPath: null,
        };
      }),

      setVoiceEnabled: (enabled) => set({ isVoiceEnabled: enabled }),
      setMountaineeringMode: (enabled) => set({ isMountaineeringMode: enabled }),
      setReturnMode: (mode) => set({ returnMode: mode, shortcutPath: null }),
      setTargetPointIndex: (index) => set({ targetPointIndex: index }),
      setShortcutPath: (path) => set({ shortcutPath: path }),
      setFocusedLocation: (loc) => set({ focusedLocation: loc }),
      setLocationPermissionGranted: (granted) => set({ locationPermissionGranted: granted }),
      
      saveCheckpoint: (loc) => set((state) => {
        const filtered = state.checkpoints.filter(c => c.name !== loc.name);
        return {
          checkpoints: [...filtered, { ...loc, id: Date.now().toString(), time: Date.now() }]
        };
      }),

      clearCheckpoints: () => set({ checkpoints: [] }),

      completeTrip: () => set({ status: 'completed' }),
      
      clearCurrentTrip: () => set({ currentTrip: null, status: 'idle', shortcutPath: null }),
      
      deleteTrip: (id) => {
        if (auth.currentUser) {
          deleteDoc(doc(db, `users/${auth.currentUser.uid}/trips/${id}`)).catch(console.error);
        }
        set((state) => ({
          history: state.history.filter(t => t.id !== id)
        }));
      },

      syncHistoryFromFirebase: async () => {
        if (!auth.currentUser) return;
        try {
          const snapshot = await getDocs(collection(db, `users/${auth.currentUser.uid}/trips`));
          const trips: Trip[] = [];
          snapshot.forEach(doc => {
            trips.push(doc.data() as Trip);
          });
          trips.sort((a, b) => b.startTime - a.startTime);
          set({ history: trips });
        } catch (e) {
          console.error("Error syncing from Firebase", e);
        }
      }
    }),
    {
      name: 'return-to-origin-storage',
      partialize: (state) => ({ history: state.history, checkpoints: state.checkpoints, isVoiceEnabled: state.isVoiceEnabled, isMountaineeringMode: state.isMountaineeringMode }),
    }
  )
);

