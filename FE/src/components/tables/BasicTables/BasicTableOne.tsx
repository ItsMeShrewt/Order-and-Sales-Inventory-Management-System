import { useMemo } from "react";
import Badge from "../../ui/badge/Badge";
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
} from '@tanstack/react-table';

interface Order {
  id: number;
  user: {
    image: string;
    name: string;
    computer: string;
  };
  team: {
    images: string[];
  };
  status: string;
  totalAmount: string;
}

// Define the table data using the interface
const tableData: Order[] = [
  {
    id: 1,
    user: {
      image: "/images/user/user-17.jpg",
      name: "Lindsey Curtis",
      computer: "PC - 1",
    },
    team: {
      images: [
        "/images/user/user-22.jpg",
        "/images/user/user-23.jpg",
        "/images/user/user-24.jpg",
      ],
    },
    status: "Pending",
    totalAmount: "$2,500.00",
  },
];

export default function BasicTableOne() {
  const columns = useMemo<ColumnDef<Order>[]>(() => [
    {
      accessorKey: 'user.name',
      header: 'Customer Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 overflow-hidden rounded-full">
            <img
              width={40}
              height={40}
              src={row.original.user.image}
              alt={row.original.user.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {row.original.user.name}
            </span>
            <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
              {row.original.user.computer}
            </span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'team.images',
      header: 'Products',
      cell: ({ row }) => (
        <div className="flex items-center -space-x-2">
          {row.original.team.images.map((img, i) => (
            <img
              key={i}
              width={32}
              height={32}
              src={img}
              alt={`Team member ${i + 1}`}
              className="h-8 w-8 rounded-full object-cover ring-2 ring-white dark:ring-gray-900"
            />
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge size="sm" color={row.original.status === "Pending" ? "warning" : "success"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'totalAmount',
      header: 'Total Amount',
      cell: ({ row }) => row.original.totalAmount,
    },
    {
      id: 'actions',
      header: 'Action',
      cell: () => (
        <button className="text-blue-600 hover:underline dark:text-blue-400">
          View
        </button>
      ),
    },
  ], []);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          <table className="min-w-full">
            <thead className="border-b border-gray-100 dark:border-white/[0.05]">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, idx) => (
                    <th
                      key={header.id}
                      className={`px-5 py-3 font-medium text-gray-500 text-theme-xs dark:text-gray-400 ${
                        idx < 2 ? 'text-start' : 'text-center'
                      }`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell, idx) => (
                    <td
                      key={cell.id}
                      className={`px-4 py-3 text-gray-500 text-theme-sm dark:text-gray-400 ${
                        idx < 2 ? 'text-start' : 'text-center'
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
    </div>
  );
}
