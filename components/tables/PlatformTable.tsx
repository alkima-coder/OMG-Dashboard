import React from 'react';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className = '', ...props }, ref) => (
  <table ref={ref} className={`min-w-full text-left text-[clamp(12px,1vw,14px)] whitespace-nowrap border-separate [border-spacing:0] caption-bottom ${className}`} {...props} />
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className = '', ...props }, ref) => (
  <thead ref={ref} className={`[&_tr]:border-b ${className}`} {...props} />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className = '', ...props }, ref) => (
  <tbody ref={ref} className={`[&_tr:last-child]:border-0 ${className}`} {...props} />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className = '', ...props }, ref) => (
  <tr ref={ref} className={`transition-colors ${className}`} {...props} />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className = '', ...props }, ref) => (
  <th ref={ref} className={`px-4 py-4 text-xs font-bold uppercase tracking-wider align-middle [&:has([role=checkbox])]:pr-0 ${className}`} {...props} />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className = '', ...props }, ref) => (
  <td ref={ref} className={`px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0 ${className}`} {...props} />
));
TableCell.displayName = "TableCell";