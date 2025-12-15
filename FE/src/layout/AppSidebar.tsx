import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/axios";
import { Link, useLocation } from "react-router";

// Assume these icons are imported from an icon library
import {
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ShoppingBasketIcon,
  OrderIcon,
  HistoryIcon,
  CategoryIcon,
  ReportIcon,
  InventoryIcon,
  DamageIcon
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; icon?: React.ReactNode; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/dashboard",   // direct link
  },
  {
    name: "Order Management",
    icon: <OrderIcon />,
    path: "/orderpage", // direct link
  },
  {
    name: "Orders",
    icon: <HistoryIcon />,
    path: "/orders"
  },
];

const productItems: NavItem[] = [
  {
    name: "Products", 
    icon: <ShoppingBasketIcon />, 
    path: "/products",
  },
  {    
    name: "Categories", 
    icon: <CategoryIcon />, 
    path: "/category",
  }
];
const salesItems: NavItem[] = [
  {
    name: "Sales Report",
    icon: <ReportIcon />,
    path: "/reports/sales", // direct link to new Sales Report page
  },
  {
    name: "Inventory Report",
    icon: <InventoryIcon />,
    path: "/inventory", // direct link to new Sales Report page
  },
  {
    name: "Damage Report",
    icon: <DamageIcon />,
    path: "/reports/damage", // direct link to Damage Report page
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "product";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => location.pathname === path;
  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    ["main", "product"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : productItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "product",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  // Poll completed (history) orders count so we can show a badge in the sidebar
  useEffect(() => {
    let mounted = true;
    let pollId: any = null;
    let unsubRealtime: (() => void) | null = null;

    (async () => {
      try {
        const rt = await import("../lib/realtime");
        const info = await rt.initRealtime();
        if (!mounted) return;
        if (info.provider === "pusher" || info.provider === "sse") {
          // listen for orders created and refresh the count
          unsubRealtime = rt.subscribe("orders", "OrderCreated", async (_payload: any) => {
            try {
              const res = await api.get('/orders');
              const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
              const pending = Array.isArray(data) ? data.filter((o: any) => !o.sale).length : 0;
              if (!mounted) return;
              setPendingCount(pending);
            } catch (e) {
              // ignore
            }
          });
          // also perform an initial fetch
          const res = await api.get('/orders');
          const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
          const pending = Array.isArray(data) ? data.filter((o: any) => !o.sale).length : 0;
          if (mounted) setPendingCount(pending);
          return;
        }
      } catch (e) {
        // ignore and fall back to polling
      }

      // polling fallback (faster than before)
      const fetchCompletedCount = async () => {
        try {
          const res = await api.get('/orders');
          const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
          const pending = Array.isArray(data) ? data.filter((o: any) => !o.sale).length : 0;
          if (!mounted) return;
          setPendingCount(pending);
        } catch (e) {
          // ignore
        }
      };
      await fetchCompletedCount();
      pollId = setInterval(fetchCompletedCount, 5000);
    })();

    return () => { mounted = false; if (pollId) clearInterval(pollId); if (unsubRealtime) unsubRealtime(); };
  }, []);

  const handleSubmenuToggle = (index: number, menuType: "main" | "product") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main" | "product") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`relative menu-item-icon-size ${
                      isActive(nav.path)
                        ? "menu-item-icon-active"
                        : "menu-item-icon-inactive"
                    } ${nav.name === 'Damage Report' ? '[&_svg]:fill-black [&_svg]:dark:fill-gray-900' : ''}`}
                >
                    {nav.icon}
                    {nav.name === 'Orders' && !((isExpanded || isHovered || isMobileOpen)) && pendingCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 z-10 flex items-center justify-center">
                        <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-orange-400 text-white text-xs font-medium">{pendingCount}</span>
                        <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping -z-10"></span>
                      </span>
                    )}
                  </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text flex items-center justify-between flex-1">{nav.name}
                    {nav.name === 'Orders' && pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center relative">
                        <span className="inline-flex items-center justify-center h-5 min-w-[26px] px-1.5 rounded-full bg-orange-400 text-white text-xs font-medium">{pendingCount}</span>
                        <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping -z-10"></span>
                      </span>
                    )}
                  </span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {/* SUB ICON */}
                        {subItem.icon && (
                          <span className="menu-item-icon-size">
                            {subItem.icon}
                          </span>
                        )}
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link to="/dashboard">
              {isExpanded || isHovered || isMobileOpen ? (
                <div className="flex items-center gap-3">
                  <img
                    src="/images/logo/MKB.jpg"
                    alt="MKB logo"
                    width={50}
                    height={50}
                    className="rounded-lg"
                  />
                  <span className="font-semibold text-2xl text-gray-800 dark:text-gray-900">MKB</span>
                </div>
              ) : (
                <img
                  src="/images/logo/MKB.jpg"
                  alt="MKB logo"
                  width={50}
                  height={50}
                  className="rounded-lg"
                />
              )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>
            <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Product Catalog"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(productItems, "product")}
            </div>
            <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Reports"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(salesItems, "product")}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
