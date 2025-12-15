import React, { useEffect, useState } from 'react';
import api from '../../lib/axios';


type CategoryVariant = 'grid' | 'horizontal';

type CategoryProps = {
  variant?: CategoryVariant;
  /** optionally provide categories explicitly (skips internal fetch) */
  initialCategories?: { id: string; label: string }[];
};

const Category: React.FC<CategoryProps> = ({ variant = 'grid', initialCategories }) => {
  const [active, setActive] = useState<string>('all');
  // default only exposes the 'All' category while the API populates the rest
  const [categories, setCategories] = useState<{id: string; label: string}[]>([{ id: 'all', label: 'All' }]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // If the parent passed categories explicitly we use those and skip fetching
    if (initialCategories && initialCategories.length > 0) {
      setCategories(initialCategories);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get('/categories');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        type RawCategory = { id?: string | number; category_name?: string; name?: string };
        const opts = data.map((c: RawCategory) => ({ id: String(c.id), label: c.category_name ?? c.name ?? `#${c.id}` }));
        // always ensure 'all' is present at the start
        setCategories([{ id: 'all', label: 'All' }, ...opts]);
      } catch (err) {
        // If fetch fails, log debug and keep the single 'All' category so the UI still renders
        console.debug('Category load failed', err);
        setCategories([{ id: 'all', label: 'All' }]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [initialCategories]);

  function selectCategory(id: string, label: string) {
    const prev = active === id ? 'all' : id;
    const labelToSend = prev === 'all' ? '' : label;
    setActive(prev);
    // publish an event with both id and label so ProductGrid can match by either
    window.dispatchEvent(new CustomEvent('products:filterCategory', { detail: { category: prev, label: labelToSend } }));
  }

  return (
    <section className="mt-6 mb-6">
      <div className="mb-4">
        <h3 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white/95 leading-snug">Categories</h3>
      </div>

      {loading ? (
        // Skeleton loader for categories
        variant === 'grid' ? (
          <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3 max-w-4xl">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto py-1 -mx-2 px-2">
            <div className="flex items-center gap-2 w-full">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"
                />
              ))}
            </div>
          </div>
        )
      ) : variant === 'grid' ? (
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3 max-w-4xl">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(c.id, c.label)}
              aria-pressed={active === c.id}
              className={`whitespace-nowrap flex items-center justify-center py-1.5 px-4 rounded-full border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 hover:-translate-y-0.5 ${
                active === c.id
                  ? 'bg-gradient-to-br from-brand-500 to-brand-600 border-brand-600 shadow-md text-white dark:from-brand-600 dark:to-brand-700 dark:border-brand-700 scale-105'
                  : 'bg-white border-gray-200 hover:border-brand-300 hover:shadow-md dark:bg-gray-800/50 dark:border-gray-700 dark:hover:border-gray-600 hover:bg-gradient-to-br hover:from-brand-50 hover:to-white'
              }`}
            >
              <div className={`text-sm font-medium ${active === c.id ? 'text-white' : 'text-gray-800 dark:text-white/90'}`}>{c.label}</div>
            </button>
          ))}
        </div>
      ) : (
        // horizontal (pill) variant – good for user_order where a compact pill bar is preferred
        <div className="mt-4 overflow-x-auto py-1 -mx-2 px-2">
          <div className="flex items-center gap-2 w-full">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCategory(c.id, c.label)}
                aria-pressed={active === c.id}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 hover:-translate-y-0.5 ${
                  active === c.id
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white border-brand-600 shadow-lg scale-105'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-gradient-to-br hover:from-brand-50 hover:to-white hover:shadow-md dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Category;
