// File: src/hooks/usePagination.js
// Purpose: Client-side pagination for large datasets

import { useState, useMemo, useEffect } from 'react';

const usePagination = (items = [], pageSize = 20) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [size, setSize] = useState(pageSize);

    const totalPages = Math.max(1, Math.ceil(items.length / size));

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(1);
    }, [items.length, totalPages, currentPage]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * size;
        return items.slice(start, start + size);
    }, [items, currentPage, size]);

    const pageNumbers = useMemo(() => {
        const pages = [];
        const max = 5;
        if (totalPages <= max) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else if (currentPage <= 3) {
            for (let i = 1; i <= max; i++) pages.push(i);
        } else if (currentPage >= totalPages - 2) {
            for (let i = totalPages - max + 1; i <= totalPages; i++) pages.push(i);
        } else {
            for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
        }
        return pages;
    }, [totalPages, currentPage]);

    return {
        currentPage,
        setCurrentPage,
        pageSize: size,
        setPageSize: setSize,
        totalPages,
        paginatedItems,
        pageNumbers,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
        next: () => setCurrentPage(p => Math.min(totalPages, p + 1)),
        prev: () => setCurrentPage(p => Math.max(1, p - 1)),
        goTo: (page) => setCurrentPage(Math.max(1, Math.min(totalPages, page))),
        startIndex: (currentPage - 1) * size,
        endIndex: Math.min(currentPage * size, items.length),
        total: items.length,
    };
};

export default usePagination;