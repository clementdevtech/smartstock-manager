import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const Card = ({ title, value, icon: Icon, trend }) => {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-xl transition-all">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        {Icon && <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
      </div>

      <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{value}</h2>

      {trend && (
        <div
          className={`flex items-center text-sm font-medium mt-2 ${
            trend > 0 ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {trend > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span className="ml-1">{Math.abs(trend)}% from last week</span>
        </div>
      )}
    </div>
  );
};

export default Card;
