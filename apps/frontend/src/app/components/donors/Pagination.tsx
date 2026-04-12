'use client';
import React from 'react';
import Image from 'next/image';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Returns the page items to render, using '...' for collapsed ranges. */
function getPageItems(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);

  if (current <= 3) return [1, 2, 3, '...', total];
  if (current >= total - 2) return [1, '...', total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const items = getPageItems(currentPage, totalPages);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {/* Left arrow */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 4,
          cursor: currentPage === 1 ? 'default' : 'pointer',
          opacity: currentPage === 1 ? 0.4 : 1,
          padding: 0,
        }}
      >
        <Image src="/chevron-left.svg" alt="" width={40} height={40} />
      </button>

      {items.map((item, i) =>
        item === '...' ? (
          <span
            key={`ellipsis-${i}`}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 'bold',
              color: '#2D6138',
            }}
          >
            ...
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            aria-current={item === currentPage ? 'page' : undefined}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: item === currentPage ? '#2D6138' : 'none',
              borderRadius: 4,
              border: item === currentPage ? 'none' : '1px solid #AAAAAA',
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 17,
              paddingRight: 17,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                color: item === currentPage ? '#FFFFFF' : '#2D6138',
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              {item}
            </span>
          </button>
        )
      )}

      {/* Right arrow */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 4,
          cursor: currentPage === totalPages ? 'default' : 'pointer',
          opacity: currentPage === totalPages ? 0.4 : 1,
          padding: 0,
        }}
      >
        <Image src="/chevron-right.svg" alt="" width={40} height={40} />
      </button>
    </div>
  );
}
