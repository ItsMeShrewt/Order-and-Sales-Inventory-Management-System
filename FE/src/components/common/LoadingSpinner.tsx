export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="relative">
        <div className="w-20 h-20 border-8 border-gray-200 dark:border-gray-700 border-t-brand-500 rounded-full animate-spin"></div>
      </div>
    </div>
  );
}
