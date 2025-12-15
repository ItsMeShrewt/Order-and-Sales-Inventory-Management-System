import { Link } from "react-router";

interface BreadcrumbProps {
  pageTitle: string;
  /** Optional className override for the page title element */
  titleClassName?: string;
  /** Optional inline style for the page title element */
  titleStyle?: React.CSSProperties;
  /** Optional override for the last breadcrumb label (defaults to pageTitle) */
  breadcrumbLabel?: string;
  /** If true, do not render the Home link in the breadcrumb */
  hideHome?: boolean;
  /** Render the last breadcrumb as a clickable button */
  breadcrumbAsButton?: boolean;
  /** onClick handler for the last breadcrumb button */
  breadcrumbOnClick?: (() => void) | undefined;
  /** Optional icon to render before the breadcrumb label (React node) */
  breadcrumbIcon?: React.ReactNode;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({
  pageTitle,
  titleClassName,
  titleStyle,
  breadcrumbLabel,
  hideHome,
  breadcrumbAsButton,
  breadcrumbOnClick,
  breadcrumbIcon,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h2
        className={
          titleClassName ??
          "text-2xl lg:text-3xl tracking-tight font-bold text-gray-900 dark:text-white/95"
        }
        style={titleStyle}
      >
        {pageTitle}
      </h2>
      <nav>
        <ol className="flex items-center gap-1.5">
          {!hideHome && (
            <li>
              <Link
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                to="/Dashboard"
              >
                Home
                <svg
                  className="stroke-current"
                  width="17"
                  height="16"
                  viewBox="0 0 17 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                    stroke=""
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </li>
          )}
          <li className="text-sm text-gray-800 dark:text-white/90">
            {breadcrumbAsButton ? (
              <button
                onClick={breadcrumbOnClick}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white/90"
              >
                {breadcrumbIcon && (
                  <span className="inline-flex items-center">{breadcrumbIcon}</span>
                )}
                <span>{breadcrumbLabel ?? pageTitle}</span>
              </button>
            ) : (
              breadcrumbLabel ?? pageTitle
            )}
          </li>
        </ol>
      </nav>
    </div>
  );
};

export default PageBreadcrumb;
