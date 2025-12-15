import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";
import api from "../../lib/axios";

export default function SalesBoard() {
  const [annualSales, setAnnualSales] = useState<number>(0);
  const [todaySales, setTodaySales] = useState<number>(0);
  const [weeklySales, setWeeklySales] = useState<number>(0);
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Helper function to check if an order is from today's business day (8am to 2am)
  const isTodayOrder = (orderDate: Date): boolean => {
    const now = new Date();
    
    // Get current business day start (8am today or 8am yesterday if before 2am)
    let businessDayStart = new Date(now);
    if (now.getHours() < 2) {
      // Before 2am - business day started yesterday at 8am
      businessDayStart.setDate(now.getDate() - 1);
    }
    businessDayStart.setHours(8, 0, 0, 0);
    
    // Get business day end (2am next day)
    const businessDayEnd = new Date(businessDayStart);
    businessDayEnd.setDate(businessDayStart.getDate() + 1);
    businessDayEnd.setHours(2, 0, 0, 0);
    
    return orderDate >= businessDayStart && orderDate < businessDayEnd;
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/orders/completed?_t=${Date.now()}`);
        const orders = Array.isArray(res.data) ? res.data : res.data.data || [];
        
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Calculate start of week (Monday-based, same as SalesReport)
        const startOfWeek = new Date(now);
        const dayOfWeek = startOfWeek.getDay(); // 0 Sun - 6 Sat
        const diff = ((dayOfWeek + 6) % 7); // Monday = 0, Sunday = 6
        startOfWeek.setDate(startOfWeek.getDate() - diff);
        startOfWeek.setHours(0, 0, 0, 0);
        
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        
        // Business day is from 8am to 2am next day
        const businessDayStart = new Date(now);
        if (now.getHours() < 2) {
          // Before 2am - business day started yesterday at 8am
          businessDayStart.setDate(now.getDate() - 1);
        }
        businessDayStart.setHours(8, 0, 0, 0);

        let annual = 0, today = 0, weekly = 0, monthly = 0;

        for (const order of orders) {
          // Use sale_date from the associated sale record if available, otherwise use order_date or created_at
          const dateStr = order.sale?.sale_date || order.order_date || order.created_at || order.createdAt;
          const orderDate = new Date(dateStr || '');
          
          // Skip if date is invalid
          if (isNaN(orderDate.getTime())) continue;
          
          // Use the order's total_amount or the sale's total_amount
          const orderTotal = Number(order.total_amount ?? order.sale?.total_amount ?? 0);

          if (orderDate >= startOfYear) annual += orderTotal;
          if (orderDate >= startOfMonth) monthly += orderTotal;
          if (orderDate >= startOfWeek) weekly += orderTotal;
          if (isTodayOrder(orderDate)) today += orderTotal;
        }

        if (isMounted) {
          setAnnualSales(annual);
          setMonthlySales(monthly);
          setWeeklySales(weekly);
          setTodaySales(today);
        }
      } catch (err) {
        console.debug('Failed to load sales data', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) return `₱${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `₱${(value / 1000).toFixed(2)}K`;
    return `₱${value.toFixed(2)}`;
  };
  
  const series = [Math.min((annualSales / 100000) * 100, 100)];
  
  const options: ApexOptions = {
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radialBar",
      height: 1000,
      sparkline: {
        enabled: true,
      },
    },
    plotOptions: {
      radialBar: {
        startAngle: -85,
        endAngle: 85,
        hollow: {
          size: "80%",
        },
        track: {
          background: "#E4E7EC",
          strokeWidth: "100%",
          margin: 5, // margin is in pixels
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            fontSize: "36px",
            fontWeight: "600",
            offsetY: -40,
            color: "#C9A56E",
            formatter: function () {
              return formatCurrency(annualSales);
            },
          },
        },
      },
    },
    fill: {
      type: "solid",
      colors: ["#465FFF"],
    },
    stroke: {
      lineCap: "round",
    },
    labels: ["Progress"],
  };
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/10">
      {loading ? (
        <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6 animate-pulse">
          <div className="flex justify-between mb-6">
            <div className="space-y-2">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="relative w-64 h-64">
              <div className="absolute inset-0 rounded-full border-8 border-gray-200 dark:border-gray-700"></div>
              <div className="absolute inset-8 rounded-full bg-gray-100 dark:bg-gray-800"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-10 w-full max-w-[380px]">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          </div>
          <div className="flex items-center justify-center gap-5 mt-6 sm:gap-8">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto"></div>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
            </div>
            <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto"></div>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
            </div>
            <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto"></div>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
            <div className="flex justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  Annual Sales
                </h3>
                <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
                  This is your total sales this year
                </p>
              </div>
            </div>
            <div className="relative ">
              <div className="max-h-[1000px]" id="chartDarkStyle">
                <Chart
                  options={options}
                  series={series}
                  type="radialBar"
                  height={1000}
                />
              </div>
            </div>
            <p className="mx-auto mt-10 w-full max-w-[380px] text-center text-sm text-gray-500 sm:text-base">
              You earn {formatCurrency(todaySales)} today, keep it up!
            </p>
          </div>

          <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
            <div>
              <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
                Today
              </p>
              <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
                {formatCurrency(todaySales)}
              </p>
            </div>

            <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>

            <div>
              <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
                Weekly
              </p>
              <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
                {formatCurrency(weeklySales)}
              </p>
            </div>

            <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>

            <div>
              <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
                Monthly
              </p>
              <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
                {formatCurrency(monthlySales)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
