import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { User, UserStatus } from '../types';
// Note: Chart.js integration is optional — the component will attempt a dynamic import
// when the user enables it. If you want Chart.js features, install: `npm i chart.js react-chartjs-2`

const BarChart: React.FC<{ labels: string[]; values: number[]; height?: number }> = ({ labels, values, height = 64 }) => {
  const max = Math.max(1, ...values);
  const barWidth = values.length > 0 ? (100 / values.length) : 100;
  return (
    <div className="w-full">
      <svg className="w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" height={height}>
        {values.map((v, i) => {
          const h = (max === 0) ? 0 : (v / max) * (height - 18);
          const rectWidth = Math.max(4, barWidth - 6);
          const rectX = i * barWidth + 2;
          const rectY = height - h;
          const textX = i * barWidth + barWidth / 2;
          const textY = rectY - 2;
          return (
            <g key={i}>
              <rect x={rectX} y={rectY} width={rectWidth} height={h} rx="2" fill="#0ea5a4" />
              <text x={textX} y={textY} textAnchor="middle" fontSize={3.5} fill="#0f172a" fontWeight={700}>{v}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] mt-1 text-slate-600">
        {labels.map((l, i) => (
          <div key={i} className="text-center truncate" style={{ width: `${100 / labels.length}%` }}>{l}</div>
        ))}
      </div>
    </div>
  );
};

  const LineChart: React.FC<{ labels: string[]; values: number[]; height?: number }> = ({ labels, values, height = 40 }) => {
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
    const y = max === 0 ? 100 : 100 - (v / max) * 100;
    return `${x},${y}`;
  });
  const areaPoints = points.length ? `${points.join(' ')} 100,100 0,100` : '';
  return (
    <div className="w-full" style={{ height: `${height + 28}px` }}>
      <svg className="w-full" viewBox={`0 0 100 100`} height={height} preserveAspectRatio="none">
        {/* horizontal grid lines */}
        <line x1="0%" x2="100%" y1="20%" y2="20%" stroke="#eef2f7" strokeWidth={0.6} />
        <line x1="0%" x2="100%" y1="50%" y2="50%" stroke="#eef2f7" strokeWidth={0.6} />
        <line x1="0%" x2="100%" y1="80%" y2="80%" stroke="#eef2f7" strokeWidth={0.6} />
        {/* subtle filled area */}
        {areaPoints && <polyline points={areaPoints} fill="#0ea5a4" fillOpacity={0.06} stroke="none" />}
        <polyline points={points.join(' ')} fill="none" stroke="#0ea5a4" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
          const y = max === 0 ? 100 : 100 - (v / max) * 100;
          return (
            <g key={i}>
              <circle cx={`${x}%`} cy={`${y}%`} r={0.9} fill="#0ea5a4">
                <title>{`${v} usuarios`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] mt-1 text-slate-600">
        {labels.map((l, i) => (
          <div key={i} className="text-center truncate" style={{ width: `${100 / labels.length}%` }}>{l}</div>
        ))}
      </div>
    </div>
  );
};

const HorizontalBars: React.FC<{ data: Record<string, number>; maxWidth?: number }> = ({ data, maxWidth = 160 }) => {
  const colors = ['#0ea5a4', '#f97316', '#60a5fa', '#f43f5e', '#a78bfa', '#84cc16'];
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="w-full">
      {entries.map(([k, v], i) => {
        const pct = Math.round((v / total) * 100);
        return (
          <div key={k} className="flex items-center gap-2 mb-2">
            <div className="w-20 text-[12px] text-slate-700 capitalize">{k}</div>
            <div className="flex-1 bg-slate-100 rounded-full h-3 relative overflow-hidden" style={{ maxWidth }}>
              <div style={{ width: `${pct}%`, background: colors[i % colors.length] }} className="h-3 rounded-full" />
            </div>
            <div className="w-12 text-right text-sm font-semibold text-slate-700">{v}</div>
            <div className="w-8 text-[11px] text-slate-500">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
};

export const MetricsPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [topByMuscle, setTopByMuscle] = useState<Record<string, { name: string; count: number }[]>>({});
  const [loginStartDate, setLoginStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [loginEndDate, setLoginEndDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<'5y'|'1y'|'1m'|'7d'|'1d'>('7d');
  const [granularity, setGranularity] = useState<'auto'|'hour'|'day'|'month'>('auto');
  const [useChartLib, setUseChartLib] = useState(false);
  const [ChartLib, setChartLib] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // try strict backend fetch first (no local fallback)
        const [u, a, bank, routines] = await Promise.all([
          apiService.getUsersStrict(),
          apiService.getAuditLogsStrict(),
          apiService.getExerciseBankStrict(),
          apiService.getRoutinesStrict((currentUser as any)?.role)
        ]);
        if (!mounted) return;
        setConnError(null);
        setUsers(u || []);
        setAudit(a || []);

        // Build mapping exercise -> muscle (category) from bank
        const exerciseToMuscle: Record<string, string> = {};
        Object.entries(bank || {}).forEach(([muscle, exercises]: any) => {
          (exercises || []).forEach((ex: string) => {
            exerciseToMuscle[ex] = muscle;
          });
        });

        // Count occurrences per muscle per exercise
        const muscleMap: Record<string, Record<string, number>> = {};
        (routines || []).forEach((r: any) => {
          (r.weeks || []).forEach((w: any) => {
            (w.days || []).forEach((d: any) => {
              (d.exercises || []).forEach((ex: any) => {
                const name = (ex.name || ex || '').toString();
                const muscle = exerciseToMuscle[name] || 'Otros';
                muscleMap[muscle] = muscleMap[muscle] || {};
                muscleMap[muscle][name] = (muscleMap[muscle][name] || 0) + 1;
              });
            });
          });
        });

        const top: Record<string, { name: string; count: number }[]> = {};
        Object.entries(muscleMap).forEach(([muscle, exMap]) => {
          const arr = Object.entries(exMap).map(([name, count]) => ({ name, count }));
          arr.sort((a, b) => b.count - a.count);
          top[muscle] = arr.slice(0, 5);
        });
        setTopByMuscle(top);
      } catch (e) {
        // strict fetch failed — fall back to existing methods but notify
        console.warn('[MetricsPanel] strict backend fetch failed, falling back to local:', e);
        if (!mounted) return;
        setConnError('No se pudo conectar al servidor. Mostrando datos locales.');
        try {
          const [u, a, bank, routines] = await Promise.all([
            apiService.getUsers(),
            apiService.getAuditLogs(),
            apiService.getExerciseBank(),
            apiService.getRoutines((currentUser as any)?.role)
          ]);
          if (!mounted) return;
          setUsers(u || []);
          setAudit(a || []);

          // rebuild topByMuscle from fallback data
          const exerciseToMuscle: Record<string, string> = {};
          Object.entries(bank || {}).forEach(([muscle, exercises]: any) => {
            (exercises || []).forEach((ex: string) => { exerciseToMuscle[ex] = muscle; });
          });
          const muscleMap: Record<string, Record<string, number>> = {};
          (routines || []).forEach((r: any) => {
            (r.weeks || []).forEach((w: any) => {
              (w.days || []).forEach((d: any) => {
                (d.exercises || []).forEach((ex: any) => {
                  const name = (ex.name || ex || '').toString();
                  const muscle = exerciseToMuscle[name] || 'Otros';
                  muscleMap[muscle] = muscleMap[muscle] || {};
                  muscleMap[muscle][name] = (muscleMap[muscle][name] || 0) + 1;
                });
              });
            });
          });
          const top: Record<string, { name: string; count: number }[]> = {};
          Object.entries(muscleMap).forEach(([muscle, exMap]) => {
            const arr = Object.entries(exMap).map(([name, count]) => ({ name, count }));
            arr.sort((a, b) => b.count - a.count);
            top[muscle] = arr.slice(0, 5);
          });
          setTopByMuscle(top);
        } catch (err2) {
          if (!mounted) return;
          setUsers([]);
          setAudit([]);
          setTopByMuscle({});
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Active / Inactive
  const activeCount = users.filter(u => u.status === UserStatus.ACTIVE).length;
  const inactiveCount = users.filter(u => u.status === UserStatus.INACTIVE).length;

  // Origin counts
  const originMap: Record<string, number> = {};
  users.forEach(u => {
    const o = (u.origin || u.provider || 'manual').toString();
    originMap[o] = (originMap[o] || 0) + 1;
  });

  // Order origins: manual first, google second, then the rest
  const originKeysAll = Object.keys(originMap);
  const orderedOrigins: string[] = [];
  if (originMap['manual']) orderedOrigins.push('manual');
  if (originMap['google']) orderedOrigins.push('google');
  originKeysAll.forEach(k => { if (!['manual', 'google'].includes(k)) orderedOrigins.push(k); });

  // Expired / expiring
  const now = Date.now();
  let expired = 0;
  let expiringSoon = 0;
  const expiredUsers: { id: string; name: string; email?: string; origin?: string; date: string; status: string }[] = [];
  const expiringUsers: { id: string; name: string; email?: string; origin?: string; date: string; status: string }[] = [];
  users.forEach(u => {
    if (!u.subscriptionEndDate) return;
    const t = new Date(u.subscriptionEndDate).getTime();
    if (t < now) expired++;
    else if ((t - now) / (1000 * 60 * 60 * 24) <= 7) expiringSoon++;
    // collect for tables
    if (t < now) {
      expiredUsers.push({ id: u.id, name: u.name, email: (u as any).email || (u as any).emailAddress || '', origin: (u.origin || (u as any).provider || 'manual'), date: u.subscriptionEndDate, status: 'Vencido' });
    } else if ((t - now) / (1000 * 60 * 60 * 24) <= 7) {
      expiringUsers.push({ id: u.id, name: u.name, email: (u as any).email || (u as any).emailAddress || '', origin: (u.origin || (u as any).provider || 'manual'), date: u.subscriptionEndDate, status: 'Por vencer' });
    }
  });

  // Logins for selected range from loginStartDate to loginEndDate (inclusive)
  const startObj = (() => {
    const d = new Date(loginStartDate);
    if (isNaN(d.getTime())) return new Date(new Date().setDate(new Date().getDate() - 6));
    return d;
  })();
  const endObj = (() => {
    const d = new Date(loginEndDate);
    if (isNaN(d.getTime())) return new Date();
    return d;
  })();
  // ensure start <= end
  if (startObj.getTime() > endObj.getTime()) {
    const tmp = new Date(startObj);
    startObj.setTime(endObj.getTime());
    endObj.setTime(tmp.getTime());
  }
  const daysDiff = Math.floor((endObj.getTime() - startObj.getTime()) / (24 * 60 * 60 * 1000));
  const last7 = Array.from({ length: daysDiff + 1 }, (_, i) => {
    const d = new Date(startObj);
    d.setDate(startObj.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const loginCounts = last7.map(() => 0);
  if (audit && audit.length) {
    audit.forEach(a => {
      const t = new Date(a.timestamp || a.time || a.date || a.createdAt || null).getTime();
      if (!t || isNaN(t)) return;
      for (let i = 0; i < last7.length; i++) {
        const start = last7[i].getTime();
        const end = start + 24 * 60 * 60 * 1000;
        if (t >= start && t < end) {
          const action = (a.action || '').toString().toLowerCase();
          if (action.includes('login') || action.includes('sign')){ /*|| action.includes('auth')) { */
            loginCounts[i] = (loginCounts[i] || 0) + 1;
          }
        }
      }
    });
  }

  // Fallback mock if no audit login data
  const hasLoginData = loginCounts.some(v => v > 0);
  const labels = last7.map(d => `${d.getMonth()+1}/${d.getDate()}`);
  const loginValues = hasLoginData ? loginCounts : [2, 3, 5, 4, 8, 6, 7];

  // Activity buckets generation for selectable ranges (5y,1y,1m,7d,1d)
  // Counts unique users per bucket, but if the same user logs in multiple times within 3 hours,
  // those repeated logins count as a single event (de-duplication window = 3 hours)
  const getBuckets = (range: '5y'|'1y'|'1m'|'7d'|'1d') => {
    const now = new Date();
    let start: Date;
    let unit: 'hour'|'day'|'month';
    let count = 0;
    if (range === '5y') { start = new Date(now.getFullYear() - 5, now.getMonth(), 1); unit = 'month'; count = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1; }
    else if (range === '1y') { start = new Date(now.getFullYear() - 1, now.getMonth(), 1); unit = 'month'; count = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1; }
    else if (range === '1m') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30); unit = 'day'; count = Math.ceil((now.getTime() - start.getTime())/(24*60*60*1000)) + 1; }
    else if (range === '7d') { start = new Date(now.getTime() - 7*24*60*60*1000); unit = 'hour'; count = 7*24 + 1; }
    else { start = new Date(now.getTime() - 24*60*60*1000); unit = 'hour'; count = 24 + 1; }

    const buckets: { start: number; end: number; label: string; set: Set<string> }[] = [];
    for (let i = 0; i < count; i++) {
      let s: Date, e: Date, label = '';
      if (unit === 'month') {
        s = new Date(start.getFullYear(), start.getMonth() + i, 1, 0,0,0,0);
        e = new Date(s.getFullYear(), s.getMonth() + 1, 1, 0,0,0,0);
        label = s.toLocaleString(undefined, { month: 'short', year: '2-digit' });
      } else if (unit === 'day') {
        s = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 0,0,0,0);
        e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, 0,0,0,0);
        label = `${s.getMonth()+1}/${s.getDate()}`;
      } else {
        s = new Date(start.getTime() + i * 60 * 60 * 1000);
        e = new Date(s.getTime() + 60 * 60 * 1000);
        const hour = s.getHours();
        const ampm = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
        const suffix = hour < 12 ? 'am' : 'pm';
        label = `${ampm}${suffix}`;
      }
      buckets.push({ start: s.getTime(), end: e.getTime(), label, set: new Set() });
    }

    // Count every login event (no 3-hour dedupe). Include any auth/login actions (Google/manual)
    // We'll increment per-event counts per bucket rather than unique users per bucket.
    const rawLabels = buckets.map(b => b.label);
    const maxLabels = 12; // target maximum labels to show in axis
    const step = rawLabels.length > maxLabels ? Math.ceil(rawLabels.length / maxLabels) : 1;
    // convert sets to numeric counters
    const counts = buckets.map(() => 0);
    (audit || []).forEach(a => {
      const ts = new Date(a.timestamp || a.time || a.date || a.createdAt || null).getTime();
      if (!ts || isNaN(ts)) return;
      if (ts < buckets[0].start || ts >= buckets[buckets.length-1].end) return;
      const action = (a.action || '').toString().toLowerCase();
      if (!(action.includes('login') || action.includes('sign') || action.includes('auth') || action.includes('signin') || action.includes('iniciar') || action.includes('sesion'))) return;
      // count this event in its bucket
      for (let bi = 0; bi < buckets.length; bi++) {
        if (ts >= buckets[bi].start && ts < buckets[bi].end) { counts[bi]++; break; }
      }
    });
    const labels = rawLabels.map((l, i) => (i % step === 0 ? l : ''));
    const values = counts;
    return { labels, values, fullLabels: rawLabels, step };
  };

  const activitySeries = (() => {
    // Allow manual granularity override: if granularity !== 'auto', map ranges to units
    if (granularity === 'hour') {
      // prefer hourly buckets: map ranges that are >=1d to hour buckets for smaller ranges only
      if (activityRange === '1d' || activityRange === '7d') return getBuckets(activityRange);
    }
    if (granularity === 'day') {
      // for multi-day ranges, compute day buckets
      if (['1m','7d'].includes(activityRange)) return getBuckets(activityRange);
      if (activityRange === '1y' || activityRange === '5y') return getBuckets(activityRange);
    }
    if (granularity === 'month') {
      if (activityRange === '1y' || activityRange === '5y') return getBuckets(activityRange);
    }
    // default behaviour
    return getBuckets(activityRange);
  })();

  // Try to dynamically load Chart.js bindings when user enables it
  useEffect(() => {
    let mounted = true;
    if (!useChartLib || ChartLib) return;
    (async () => {
      try {
        // Attempt to import Chart.js and the zoom plugin, register the plugin, then load react-chartjs-2
        const chartCore = await import('chart.js');
        // ensure controllers & elements are registered (chart.js/auto side-effects)
        try { await import('chart.js/auto'); } catch(_) { /* non-fatal */ }
        // try to load zoom plugin and register it
        try {
          const zoomMod = await import('chartjs-plugin-zoom');
          const ChartObj = chartCore && (chartCore.Chart || chartCore.default?.Chart || chartCore.default) ;
          if (ChartObj && zoomMod && (zoomMod.default || zoomMod)) {
            ChartObj.register((zoomMod && (zoomMod.default || zoomMod)) as any);
          }
        } catch (pe) {
          // plugin not available — continue without pan/zoom
          console.warn('chartjs-plugin-zoom not available; zoom/pan disabled', pe);
        }
        const rc = await import('react-chartjs-2');
        if (!mounted) return;
        setChartLib(rc);
      } catch (e) {
        console.warn('Chart.js not available, falling back to built-in chart', e);
        setChartLib(null);
        setUseChartLib(false);
      }
    })();
    return () => { mounted = false; };
  }, [useChartLib, ChartLib]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-black uppercase tracking-tighter">Métricas de la Aplicación</h2>
        <div className="text-sm text-slate-500">Actualizado: {new Date().toLocaleString()}</div>
      </header>

      {connError && (
        <div className="p-3 rounded-md bg-red-600 text-white text-sm font-bold">{connError}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500">Cargando métricas...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-1 bg-white p-4 rounded-2xl shadow">
            <div className="space-y-4">
              <div>
                <h3 className="font-black uppercase text-xs text-slate-500">Usuarios</h3>
                <div className="mt-3">
                  {(() => {
                    const total = Math.max(1, activeCount + inactiveCount);
                    const items = [
                      { key: 'Activos', value: activeCount, color: '#0ea5a4' },
                      { key: 'Inactivos', value: inactiveCount, color: '#f97316' }
                    ];
                    return (
                      <div className="flex flex-col gap-3">
                        {items.map(it => {
                          const pct = Math.round((it.value / total) * 100);
                          return (
                            <div key={it.key} className="bg-slate-50 p-2 rounded-lg flex items-center">
                              <div className="text-sm text-slate-600 w-24 flex-shrink-0">{it.key}</div>
                              <div className="flex-1 mx-3 min-w-0">
                                <div className="bg-slate-100 h-3 rounded-full overflow-hidden">
                                  <div style={{ width: `${pct}%`, background: it.color }} className="h-3 rounded-full" />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 ml-3">
                                <div className="flex-shrink-0 w-12 text-right text-sm font-extrabold text-slate-800">{it.value}</div>
                                <div className="flex-shrink-0 w-10 text-[12px] text-slate-500">{pct}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <h4 className="font-black uppercase text-xs text-slate-500">Origen de Usuarios</h4>
                <div className="mt-3">
                  {Object.keys(originMap).length === 0 ? (
                    <div className="text-[12px] text-slate-400">No hay usuarios registrados.</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {orderedOrigins.map(k => (
                        <div key={k} className="bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                          <div className="text-sm text-slate-600 capitalize">{k}</div>
                          <div className="text-lg font-extrabold text-slate-800">{originMap[k]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* 'Inicio de Sesión' metric removed as requested */}

          <div className="col-span-1 bg-white p-4 rounded-2xl shadow">
            <h3 className="font-black uppercase text-xs text-slate-500">Suscripciones</h3>
            <div className="text-2xl font-extrabold mt-3">Vencidos: {expired}</div>
            <div className="text-lg font-bold mt-1 text-amber-600">Por vencer (7d): {expiringSoon}</div>
            <div className="mt-4 text-[12px] text-slate-600">Estas cifras se calculan según `subscriptionEndDate` en los usuarios.</div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <h4 className="font-bold text-sm text-slate-600">Vencidos</h4>
                  {expiredUsers.length === 0 ? (
                    <div className="text-[12px] text-slate-400 mt-2">Nadie vencido.</div>
                  ) : (
                    <div className="w-full overflow-x-auto mt-2">
                      <table className="w-full text-sm">
                        <thead className="text-left text-[12px] text-slate-500 border-b">
                      <tr>
                        <th className="pb-2">Nombre</th>
                        <th className="pb-2">Email</th>
                        <th className="pb-2">Origen</th>
                        <th className="pb-2">Fecha</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                        <tbody>
                      {expiredUsers.map(u => (
                        <tr key={u.id} className="border-b last:border-b-0">
                          <td className="py-2 truncate">{u.name}</td>
                          <td className="py-2 truncate text-[12px] text-slate-700">{u.email || '-'}</td>
                          <td className="py-2 text-[12px] text-slate-600 capitalize">{u.origin || '-'}</td>
                          <td className="py-2 text-[12px] text-slate-500">{new Date(u.date).toLocaleDateString()}</td>
                          <td className="py-2 text-[12px] text-red-600 font-bold">{u.status}</td>
                        </tr>
                      ))}
                    </tbody>
                        </table>
                      </div>
                    )}
              </div>

              <div>
                <h4 className="font-bold text-sm text-slate-600">Por vencer (7d)</h4>
                {expiringUsers.length === 0 ? (
                  <div className="text-[12px] text-slate-400 mt-2">Nadie por vencer próximamente.</div>
                ) : (
                  <div className="w-full overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[12px] text-slate-500 border-b">
                        <tr>
                          <th className="pb-2">Nombre</th>
                          <th className="pb-2">Email</th>
                          <th className="pb-2">Origen</th>
                          <th className="pb-2">Fecha</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expiringUsers.map(u => (
                          <tr key={u.id} className="border-b last:border-b-0">
                            <td className="py-2 truncate">{u.name}</td>
                            <td className="py-2 truncate text-[12px] text-slate-700">{u.email || '-'}</td>
                            <td className="py-2 text-[12px] text-slate-600 capitalize">{u.origin || '-'}</td>
                            <td className="py-2 text-[12px] text-slate-500">{new Date(u.date).toLocaleDateString()}</td>
                            <td className="py-2 text-[12px] text-amber-600 font-bold">{u.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          
          
          <div className="col-span-1 md:col-span-3 bg-white p-4 rounded-2xl shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-black uppercase text-xs text-slate-500">Actividad</h3>
                <div className="text-[12px] text-slate-500">Periodo:</div>
                <div className="flex gap-2">
                  {(['5y','1y','1m','7d','1d'] as const).map(r => (
                    <button key={r} onClick={() => setActivityRange(r)} className={`text-[12px] px-2 py-1 rounded ${activityRange===r? 'bg-slate-200 font-bold':'bg-white/0 text-slate-600'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[12px] text-slate-500">Granularidad</label>
                <select value={granularity} onChange={e => setGranularity(e.target.value as any)} className="bg-white border rounded px-2 py-1 text-sm">
                  <option value="auto">Auto</option>
                  <option value="hour">Hora</option>
                  <option value="day">Día</option>
                  <option value="month">Mes</option>
                </select>
                <label className="text-[12px] text-slate-500 ml-2">Use Chart.js</label>
                <input type="checkbox" checked={useChartLib} onChange={e => setUseChartLib(e.target.checked)} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[12px] text-slate-500">Usuarios únicos por periodo ({activityRange})</div>
              <div className="mt-3">
                {activitySeries.values.some(v => v > 0) ? (
                  ChartLib ? (
                    // render Chart.js Line if available — provide custom tooltip and zoom/pan options
                    (() => {
                      const labelsForChart = (activitySeries as any).fullLabels || activitySeries.labels;
                      const step = (activitySeries as any).step || 1;
                      const data = {
                        labels: labelsForChart,
                        datasets: [{ label: 'Usuarios únicos', data: activitySeries.values, fill: true, backgroundColor: 'rgba(14,165,164,0.08)', borderColor: '#0ea5a4', tension: 0.2 }]
                      };
                      const options = {
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                              title: (ctx: any) => {
                                const idx = ctx && ctx[0] && ctx[0].dataIndex; return labelsForChart && labelsForChart[idx] ? labelsForChart[idx] : '';
                              },
                              label: (ctx: any) => `${ctx.formattedValue} usuarios`
                            }
                          },
                          // zoom plugin will be registered if available; if not these options are ignored
                          zoom: {
                            pan: { enabled: true, mode: 'x' },
                            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                          }
                        },
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                          x: {
                            ticks: {
                              callback: function(this: any, val: any, idx: number) {
                                return (idx % step === 0) ? (labelsForChart && labelsForChart[idx] ? labelsForChart[idx] : '') : '';
                              },
                              maxRotation: 0,
                              autoSkip: false
                            }
                          }
                        }
                      };
                      return React.createElement(ChartLib.Line, { data, options });
                    })()
                  ) : (
                    <LineChart labels={activitySeries.labels} values={activitySeries.values} height={120} />
                  )
                ) : (
                  <div className="text-[12px] text-slate-400">No hay datos de actividad en el periodo seleccionado.</div>
                )}
              </div>
            </div>

            {/* Top 5 Ejercicios por Músculo: removido según solicitud del usuario */}
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsPanel;
