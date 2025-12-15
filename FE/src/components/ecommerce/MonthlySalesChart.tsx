import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";
import api from "../../lib/axios";

export default function MonthlySalesChart() {
  const options: ApexOptions = {
    colors: ["#465fff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 180,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "39%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },
    xaxis: {
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: {
      title: {
        text: undefined,
      },
      labels: {
        formatter: (val: number) => `₱ ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      },
    },
    grid: {
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    fill: {
      opacity: 1,
    },

    tooltip: {
      x: {
        show: false,
      },
      y: {
        formatter: (val: number) => `₱ ${Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
      },
    },
  };
  const [seriesData, setSeriesData] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  // If backend returns very small numbers (e.g., 2, 1.5) for a year we assume
  // those represent thousands (i.e., 2 -> 2,000) so charts for different years
  // remain visually consistent. Heuristic: if max < 10 and max > 0 => scale by 1000.
  const detectedMax = seriesData && seriesData.length ? Math.max(...seriesData) : 0;
  const scaleFactor = detectedMax > 0 && detectedMax < 10 ? 1000 : 1;
  const displayData = (seriesData ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map(
    (v) => Number(v) * scaleFactor
  );

  const series = [
    {
      name: "Sales",
      data: displayData,
    },
  ];
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        // fetch monthly totals for selected year and whether to include summary records
        const qs = new URLSearchParams();
        qs.set('year', String(year));
        const res = await api.get(`/sales/monthly?${qs.toString()}`);
        if (!mounted) return;
        if (res && res.data && Array.isArray(res.data.data)) {
          setSeriesData(res.data.data.map((v: any) => Number(v)));
        }
      } catch (err) {
        // silent fail — leave zeros
        console.error('Failed to load monthly sales:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [year]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
      {loading ? (
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Monthly Sales
          </h3>

          {/* Controls: year selector + include-summary toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-lg px-2 py-1 text-sm">
              <label className="sr-only" htmlFor="ms-year">Year</label>
              <select
                id="ms-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="appearance-none bg-transparent pr-6 pl-1 outline-none text-sm text-gray-700 dark:text-gray-200"
              >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = new Date().getFullYear() - i;
                return (
                  <option key={y} value={y}>{y}</option>
                );
              })}
            </select>
              </div>
            
          </div>
        </div>
      )}

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="-ml-5 min-w-[650px] xl:min-w-full pl-2">
          {loading ? (
            <div className="h-[180px] w-full animate-pulse">
              <div className="flex h-full items-end justify-around gap-2 px-4">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-t" style={{ height: `${Math.random() * 60 + 40}%` }}></div>
                ))}
              </div>
            </div>
          ) : (
            <Chart options={options} series={series} type="bar" height={180} />
          )}
        </div>
      </div>
    </div>
  );
}
