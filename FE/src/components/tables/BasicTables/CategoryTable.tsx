import { useEffect, useState, useMemo } from "react";
  import api from "../../../lib/axios";
  import EditCategoryModal from "../../modals/EditCategoryModal";
  import Swal from 'sweetalert2';
  import TableButton from '../../ui/button/TableButton';
  import { PencilIcon } from '../../../icons';
  import {
    useReactTable,
    getCoreRowModel,
    ColumnDef,
    flexRender,
  } from '@tanstack/react-table';

  type Category = {
    id: number;
    category_name?: string;
    name?: string;
    category?: string;
    created_at?: string;
    products_count?: number;
  };

  export default function CategoryTable() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState<string>("");
    const [savingEdit, setSavingEdit] = useState(false);

    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/categories");
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        setCategories(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || "Failed to load categories");
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchCategories();

      const onRefresh = () => fetchCategories();
      window.addEventListener("categories:refresh", onRefresh as EventListener);
      return () => window.removeEventListener("categories:refresh", onRefresh as EventListener);
    }, []);

    // deletion is disabled in UI and blocked server-side; no local delete helper required

    const openEdit = (c: any) => {
      setEditingId(c.id);
      setEditingName(c.category_name || c.name || c.category || '');
    };

    const closeEdit = () => {
      setEditingId(null);
      setEditingName('');
      setSavingEdit(false);
      setError(null);
    };

    const submitEdit = async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!editingId) return;
      if (!editingName.trim()) return setError('Category name cannot be empty');
      
      // Check for duplicate category name (excluding current category being edited)
      const duplicateCategory = categories.find((cat: any) => {
        const catName = cat.category_name || cat.name || cat.category || '';
        return cat.id !== editingId && catName.toLowerCase() === editingName.trim().toLowerCase();
      });
      
      if (duplicateCategory) {
        try {
          await Swal.fire({
            title: 'Category Already Exists',
            text: `A category named "${editingName.trim()}" already exists. Please use a different name.`,
            icon: 'error',
            confirmButtonText: 'OK',
            confirmButtonColor: '#ef4444',
            allowOutsideClick: true,
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
        } catch (e) {
          // ignore
        }
        return;
      }
      
      setSavingEdit(true);
      try {
        await api.put(`/categories/${editingId}`, { category: editingName.trim() });
        // refresh
        fetchCategories();
        window.dispatchEvent(new CustomEvent('categories:refresh'));
        try {
          await Swal.fire({
            title: 'Category updated',
            text: `${editingName} was updated successfully.`,
            icon: 'success',
            showConfirmButton: false,
            timer: 1200,
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

        closeEdit();
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || 'Failed to update category');
      } finally {
        setSavingEdit(false);
      }
    };

    const columns = useMemo<ColumnDef<Category>[]>(() => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => row.original.id,
      },
      {
        accessorKey: 'category_name',
        header: 'Category Name',
        cell: ({ row }) => row.original.category_name || row.original.name || row.original.category || '—',
      },
      {
        accessorKey: 'products_count',
        header: 'Total Products',
        cell: ({ row }) => row.original.products_count ?? 0,
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => row.original.created_at ? new Date(row.original.created_at).toLocaleDateString() : '—',
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <TableButton
            tooltip="Edit"
            ariaLabel="Edit"
            onClick={() => openEdit(row.original)}
            bgClass="bg-yellow-400 hover:bg-yellow-500"
          >
            <PencilIcon className="w-4 h-4" />
          </TableButton>
        ),
      },
    ], []);

    const table = useReactTable({
      data: categories,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[600px]">
            <table className="min-w-full">
              <thead className="border-b border-gray-100 dark:border-white/[0.05]">
                {loading ? (
                  <tr>
                    <th className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400">
                      <div className="flex justify-center">
                        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400">
                      <div className="flex justify-center">
                        <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    </th>
                  </tr>
                ) : (
                  table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header, idx) => (
                        <th
                          key={header.id}
                          className={`px-5 py-3 font-medium text-gray-500 text-theme-xs dark:text-gray-400 ${
                            idx === 0 ? 'text-start' : 'text-center'
                          }`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {loading && (
                  <>
                    {[...Array(5)].map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        <td className="px-5 py-4 sm:px-6 text-start">
                          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                        <td className="px-5 py-4 sm:px-6 text-center">
                          <div className="flex justify-center">
                            <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {error && !loading && (
                  <tr>
                    <td colSpan={table.getAllColumns().length} className="px-5 py-4 text-center text-red-500">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading && categories.length === 0 && !error && (
                  <tr>
                    <td colSpan={table.getAllColumns().length} className="px-5 py-4 text-center">
                      No categories found.
                    </td>
                  </tr>
                )}

                {table.getRowModel().rows.map(row => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell, idx) => (
                      <td
                        key={cell.id}
                        className={`px-4 py-3 text-gray-500 text-theme-sm dark:text-gray-400 ${
                          idx === 0 ? 'text-start' : 'text-center'
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          {/* Edit Modal */}
          <EditCategoryModal
            isOpen={editingId !== null}
            onClose={closeEdit}
            name={editingName}
            setName={setEditingName}
            onSubmit={submitEdit}
            saving={savingEdit}
            error={error}
          />
      </div>
    );
  }
