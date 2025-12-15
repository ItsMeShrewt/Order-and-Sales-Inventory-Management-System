import React from 'react';
import { Modal } from "../ui/modal";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  setName: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
}

export default function EditCategoryModal({ isOpen, onClose, name, setName, onSubmit, saving, error }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[520px] m-4">
      <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-8">
        <div className="px-2 pr-14">
          <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            Edit Category
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
            Update the category name.
          </p>
        </div>

        <form className="flex flex-col" onSubmit={onSubmit}>
          <div className="px-2">
            <Label>Category Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Biscuit"
            />
          </div>

          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-red-500 px-4 mt-2">{error}</p>
          )}
        </form>
      </div>
    </Modal>
  );
}
