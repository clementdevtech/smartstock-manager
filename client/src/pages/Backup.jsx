import React, { useState } from 'react';
import axios from 'axios';
import { Download, Upload, DatabaseBackup } from 'lucide-react';
import Toast from '../components/Toast';
import Modal from '../components/Modal';

const Backup = () => {
  const [toast, setToast] = useState(null);
  const [file, setFile] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const handleExport = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/backup/export', {
        headers,
        responseType: 'blob',
      });

      // Create a blob URL for the downloaded file
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SmartStock-Backup-${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setToast({ message: 'Backup exported successfully!', type: 'success' });
    } catch {
      setToast({ message: 'Failed to export backup', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) return setToast({ message: 'Select a file first', type: 'warning' });

    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      setLoading(true);
      const res = await axios.post('/api/backup/import', formData, { headers });
      setToast({
        message: `${res.data.importedItems} items & ${res.data.importedSales} sales restored!`,
        type: 'success',
      });
      setShowModal(false);
      setFile(null);
    } catch {
      setToast({ message: 'Failed to import backup', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <DatabaseBackup /> Backup & Restore
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-1">
            Keep your data safe
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
            Export your entire SmartStock database as a backup file and restore it at any time.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow disabled:opacity-50"
          >
            <Download size={18} />
            {loading ? 'Exporting...' : 'Export Backup'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
          >
            <Upload size={18} /> Import Backup
          </button>
        </div>
      </div>

      {/* Import Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Restore Backup">
        <form onSubmit={handleImport} className="space-y-4">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".json"
              onChange={(e) => setFile(e.target.files[0])}
              className="hidden"
              id="fileUpload"
            />
            <label
              htmlFor="fileUpload"
              className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium"
            >
              {file ? file.name : 'Click to choose backup file'}
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-md shadow disabled:opacity-50"
          >
            {loading ? 'Importing...' : 'Import Backup'}
          </button>
        </form>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Backup;
