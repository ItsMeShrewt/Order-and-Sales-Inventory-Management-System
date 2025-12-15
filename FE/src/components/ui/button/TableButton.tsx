import React from "react";

interface TableButtonProps {
  onClick?: () => void;
  ariaLabel?: string;
  tooltip?: string;
  className?: string;
  bgClass?: string; // background + hover classes passed in
  disabled?: boolean;
  children: React.ReactNode;
}

const TableButton: React.FC<TableButtonProps> = ({
  onClick,
  ariaLabel,
  tooltip,
  className = "",
  bgClass = "bg-gray-100 hover:bg-gray-200",
  disabled = false,
  children,
}) => {
  return (
    <div className="relative inline-block group">
      {tooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
          <div className="relative text-xs bg-gray-800 text-white px-2 py-1 rounded-md dark:bg-white dark:text-gray-900 min-w-[88px] text-center whitespace-nowrap">
            {tooltip}
            <span className="absolute left-1/2 transform -translate-x-1/2 top-full w-3 h-3 bg-gray-800 rotate-45 dark:bg-white" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`w-9 h-9 p-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 shadow-theme-xs ${bgClass} ${className} dark:border-gray-700 dark:text-gray-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {children}
      </button>
    </div>
  );
};

export default TableButton;
