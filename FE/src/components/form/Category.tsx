import { useState, useEffect } from "react";
import ComponentCard from "../common/ComponentCard";
import Label from "./Label";
import Input from "./input/InputField";
import api from "../../lib/axios";
import Swal from 'sweetalert2';
import CategoryTable from "../tables/BasicTables/CategoryTable";
import PageMeta from "../common/PageMeta";

export default function Category() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate initial load, set loading to false after component mounts
    const timer = setTimeout(() => setLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    
    // Check for duplicate category name
    try {
      const res = await api.get('/categories');
      const existingCategories = Array.isArray(res.data) ? res.data : res.data.data || [];
      const duplicateName = existingCategories.some((cat: any) => {
        const catName = cat.category_name || cat.name || cat.category || '';
        return catName.toLowerCase() === name.trim().toLowerCase();
      });
      
      if (duplicateName) {
        await Swal.fire({
          title: 'Category Already Exists',
          text: `A category named "${name.trim()}" already exists. Please use a different name.`,
          icon: 'error',
          confirmButtonText: 'OK',
          confirmButtonColor: '#ef4444',
          allowOutsideClick: true,
          willOpen: () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            if (container) container.style.zIndex = '200000';
          }
        });
        return;
      }
    } catch (err) {
      console.error('Failed to check for duplicate categories:', err);
      // If check fails, allow user to proceed (backend will validate)
    }
    
    setSubmitting(true);
    try {
      await api.post("/categories", { category: name.trim() });
      const addedName = name.trim();
      setName("");
      // notify tables to refresh their data
      window.dispatchEvent(new CustomEvent("categories:refresh"));
      try {
        // small success toast used across the app
        await Swal.fire({
          title: 'Category added',
          text: `${addedName || 'Category'} was added successfully.`,
          icon: 'success',
          showConfirmButton: false,
          timer: 1300,
          timerProgressBar: true,
          allowOutsideClick: true,
          willOpen: () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            if (container) container.style.zIndex = '200000';
          }
        });
      } catch (e) {
        // ignore toast errors
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <PageMeta
        title="Categories"
      />
      {/* Left: small fixed-width form on large screens */}
      <div className="w-full lg:w-80">
        <ComponentCard title={loading ? "" : "Add New Category"}>
          {loading ? (
            <div className="grid grid-cols-1 gap-6">
              <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
              <div>
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              </div>
              <div>
                <hr />
                <div className="flex justify-end mt-4">
                  <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
              <div>
                <Label htmlFor="categoryName">Category Name</Label>
                <Input
                  type="text"
                  id="categoryName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Biscuit"
                />
              </div>

              <div>
                <hr />
                <div className="flex justify-end mt-4">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 justify-center rounded-lg border border-transparent bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={submitting}
                  >
                    {submitting ? "Adding..." : "Add category"}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          )}
        </ComponentCard>
      </div>

      {/* Right: Categories Table from shared tables */}
      <div className="flex-1">
        <ComponentCard title={loading ? "" : "Categories"}>
          {loading ? (
            <div className="p-4">
              <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
              <CategoryTable />
            </div>
          ) : (
            <div className="p-4">
              <CategoryTable />
            </div>
          )}
        </ComponentCard>
      </div>
    </div>
  );
}
