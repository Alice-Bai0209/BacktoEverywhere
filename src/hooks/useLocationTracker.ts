import { useEffect, useRef, useState } from 'react';
import { useStore, Point } from '../store';
import { calculateDistance, calculateBearing } from '../lib/utils';
import { findShortcutAStar } from '../lib/astar';

export function useLocationTracker() {
  const { status, addPoint, currentTrip, targetPointIndex, setTargetPointIndex, isVoiceEnabled, returnMode, setShortcutPath, locationPermissionGranted } = useStore();
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [currentAltitude, setCurrentAltitude] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const lastSpokenTimeRef = useRef<number>(0);
  const lastDirectionsCheckRef = useRef<number>(0);

  // Google Cloud TTS
  const speak = async (text: string) => {
    if (!isVoiceEnabled) return;
    const now = Date.now();
    if (now - lastSpokenTimeRef.current < 5000) return; // Don't spam
    lastSpokenTimeRef.current = now;

    const ttsApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
    if (ttsApiKey) {
      try {
        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'zh-CN', name: 'zh-CN-Standard-A' },
            audioConfig: { audioEncoding: 'MP3' }
          })
        });
        const data = await response.json();
        if (data.audioContent) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
          audio.play();
          return;
        }
      } catch (e) {
        console.error("TTS Error", e);
      }
    }
    
    // Fallback to Web Speech API
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  // Google Maps Elevation API Fallback
  const getElevation = async (lat: number, lng: number): Promise<number | null> => {
    const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (mapsApiKey) {
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}&key=${mapsApiKey}`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].elevation;
        }
      } catch (e) {
        console.error("Google Maps Elevation Error", e);
      }
    }
    // Open-Meteo Fallback
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
      const data = await res.json();
      if (data.elevation && data.elevation.length > 0) {
        return data.elevation[0];
      }
    } catch (e) {
      console.error("Open-Meteo Elevation Error", e);
    }
    return null;
  };

  const checkEnvironmentalRisk = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,weather_code,wind_speed_10m`);
      const data = await res.json();
      if (data.current) {
        const { precipitation, weather_code, wind_speed_10m } = data.current;
        let riskMsg = "";
        if (precipitation > 0) riskMsg = "检测到降水，路面可能湿滑";
        if (wind_speed_10m > 40) riskMsg = "当前风速较大，请注意安全";
        if (weather_code >= 60) riskMsg = "恶劣天气预警，建议寻找避险处";
        
        if (riskMsg) {
          speak(riskMsg);
          return riskMsg;
        }
      }
    } catch (e) {
      console.error("Weather risk check error:", e);
    }
    return null;
  };

  // Google Maps Directions API for Risk Warning
  const checkRouteRisk = async (lat: number, lng: number, prevLat: number, prevLng: number) => {
    const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!mapsApiKey) return null;
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${prevLat},${prevLng}&destination=${lat},${lng}&departure_time=now&key=${mapsApiKey}`);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        if (leg.duration_in_traffic && leg.duration_in_traffic.value > leg.duration.value * 1.5) {
          return "前方路段拥堵或有风险，请注意安全";
        }
      }
    } catch (e) {
      console.error("Directions Error", e);
    }
    return null;
  };

  useEffect(() => {
    if (!locationPermissionGranted) return;

    // Get initial position quickly
    if (navigator.geolocation && status === 'idle') {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation([position.coords.latitude, position.coords.longitude]);
        },
        (err) => console.error("Initial location error:", err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }

    if (status === 'idle') {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, altitude, heading: gpsHeading } = position.coords;
        setCurrentLocation([latitude, longitude]);
        if (gpsHeading !== null) setHeading(gpsHeading);

        let finalAltitude = altitude;
        if (finalAltitude === null) {
          finalAltitude = await getElevation(latitude, longitude);
        }
        setCurrentAltitude(finalAltitude);

        const newPoint: Point = {
          lat: latitude,
          lng: longitude,
          alt: finalAltitude,
          time: Date.now(),
        };

        if (status === 'tracking') {
          if (currentTrip && currentTrip.points.length > 0) {
            const lastPoint = currentTrip.points[currentTrip.points.length - 1];
            const dist = calculateDistance(lastPoint.lat, lastPoint.lng, latitude, longitude);
            
            // Only record if moved more than 5 meters
            if (dist > 5) {
              // Altitude risk
              if (finalAltitude !== null && lastPoint.alt !== null) {
                const altDiff = Math.abs(finalAltitude - lastPoint.alt);
                if ((altDiff / dist) > 0.3) {
                  newPoint.risk = "陡坡预警，回程请注意安全";
                  speak(newPoint.risk);
                }
              }

              // Traffic/Route risk (check every 60 seconds to save API quota)
              const now = Date.now();
              if (now - lastDirectionsCheckRef.current > 60000) {
                lastDirectionsCheckRef.current = now;
                
                // Check Environmental Risk
                const envRisk = await checkEnvironmentalRisk(latitude, longitude);
                if (envRisk) {
                  newPoint.risk = (newPoint.risk ? newPoint.risk + "。 " : "") + envRisk;
                }

                // Check Route Risk
                const routeRisk = await checkRouteRisk(latitude, longitude, lastPoint.lat, lastPoint.lng);
                if (routeRisk) {
                  newPoint.risk = (newPoint.risk ? newPoint.risk + "。 " : "") + routeRisk;
                  speak(routeRisk);
                }
              }
              addPoint(newPoint);
            }
          } else {
            addPoint(newPoint);
          }
        } else if (status === 'returning') {
          if (!currentTrip) return;
          
          if (returnMode === 'original' && targetPointIndex >= 0) {
            const target = currentTrip.points[targetPointIndex];
            const dist = calculateDistance(latitude, longitude, target.lat, target.lng);
            
            if (dist < 15) {
              if (targetPointIndex > 0) {
                // Skip points that are too close to avoid rapid firing
                let nextIndex = targetPointIndex - 1;
                while (nextIndex > 0) {
                   const nextTarget = currentTrip.points[nextIndex];
                   const distToNext = calculateDistance(latitude, longitude, nextTarget.lat, nextTarget.lng);
                   if (distToNext >= 15) break;
                   nextIndex--;
                }
                setTargetPointIndex(nextIndex);
                speak("到达途经点，继续按指引前进");
              } else {
                speak("恭喜你，成功返回！");
                useStore.getState().completeTrip();
              }
            } else {
              const bearing = calculateBearing(latitude, longitude, target.lat, target.lng);
              if (heading !== null) {
                const diff = (bearing - heading + 360) % 360;
                if (diff > 20 && diff < 180) speak("向右转");
                else if (diff >= 180 && diff < 340) speak("向左转");
                else speak("直行");
              }
            }
          } else if (returnMode === 'shortcut') {
             const startPoint = currentTrip.points[0];
             const dist = calculateDistance(latitude, longitude, startPoint.lat, startPoint.lng);
             
             if (dist < 20) {
                speak("恭喜你，成功返回！");
                useStore.getState().completeTrip();
             } else {
                // Generate A* path if not generated yet
                if (!useStore.getState().shortcutPath) {
                  const path = findShortcutAStar(newPoint, startPoint, currentTrip.points);
                  setShortcutPath(path);
                }
                
                const currentShortcutPath = useStore.getState().shortcutPath;
                if (currentShortcutPath && currentShortcutPath.length > 0) {
                  // Find next target in shortcut path
                  const target = currentShortcutPath[1] || startPoint; // 0 is current, 1 is next
                  const bearing = calculateBearing(latitude, longitude, target.lat, target.lng);
                  if (heading !== null) {
                    const diff = (bearing - heading + 360) % 360;
                    if (diff > 20 && diff < 180) speak("向右转，走捷径");
                    else if (diff >= 180 && diff < 340) speak("向左转，走捷径");
                    else speak("直行，走捷径");
                  }
                  
                  // If reached target, remove it
                  if (calculateDistance(latitude, longitude, target.lat, target.lng) < 15) {
                     setShortcutPath(currentShortcutPath.slice(1));
                  }
                }
             }
          }
        }
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [status, currentTrip?.id, targetPointIndex, returnMode, isVoiceEnabled, locationPermissionGranted]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.webkitCompassHeading) {
        setHeading(event.webkitCompassHeading);
      } else if (event.alpha !== null) {
        setHeading(360 - event.alpha);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  return { currentLocation, currentAltitude, heading };
}
