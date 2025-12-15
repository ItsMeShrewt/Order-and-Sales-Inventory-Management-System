import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Label  from "../form/Label";
import Input from "../form/input/InputField";
import {
  PencilIcon,
  ArchiveIcon
} from "../../icons";
import TableButton from "../ui/button/TableButton";

interface Order {
  id: number;
  user: {
    image: string;
    productName: string;
    category: string;
  };
  quantity: string;
  price: string;
  status: string;
}

const tableData: Order[] = [
  {
    id: 1,
    user: {
      image: "/images/user/user-17.jpg",
      productName: "Cream-o",
      category: "Biscuit",
    },
    quantity: "5",
    price: "$25.00",
    status: "Low Stock",
  },
];

export default function OrderTable() {
    const [isModalOpen, setIsModalOpen] = useState(false);
  
    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);
  
    const handleSave = () => {
      // You can replace this with your save logic later
      console.log("Saved changes");
      closeModal();
    };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          <Table>
            {/* Table Header */}
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Products
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400"
                >
                  Price
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400"
                >
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>

            {/* Table Body */}
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {tableData.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-5 py-4 sm:px-6 text-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 overflow-hidden rounded-full">
                        <img
                          width={40}
                          height={40}
                          src={order.user.image}
                          alt={order.user.productName}
                        />
                      </div>
                      <div>
                        <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {order.user.productName}
                        </span>
                        <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                          {order.user.category}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-center text-theme-sm dark:text-gray-400">
                    {order.price}
                  </TableCell>
                  <TableCell className="px-4 py-3 pt-4 text-gray-500 text-theme-sm dark:text-gray-400 flex gap-1 justify-center">

                      <TableButton
                        tooltip="Edit"
                        ariaLabel="Edit"
                        onClick={openModal}
                        bgClass="bg-yellow-400 hover:bg-yellow-500"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </TableButton>

                      <TableButton
                        tooltip="Archive"
                        ariaLabel="Archive"
                        onClick={() => alert("Archive action")}
                        bgClass="bg-red-400 hover:bg-red-500"
                      >
                        <ArchiveIcon className="w-4 h-4" />
                      </TableButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
            <Modal isOpen={isModalOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Add Stock
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              Update your stock here to keep your inventory accurate and up-to-date
            </p>
          </div>
          <form className="flex flex-col">
            <div className="px-2 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <Label>Product Name</Label>
                  <Input type="text" value="" />
                </div>

                <div>
                  <Label>Quantity</Label>
                  <Input type="number" value="" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Close
              </Button>
              <Button size="sm" onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
