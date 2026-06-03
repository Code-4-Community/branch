'use client';

import { HStack, Button } from '@chakra-ui/react';
import { FaAngleLeft, FaAngleRight } from 'react-icons/fa';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (currentPage <= 3) return [1, 2, 3, '...', totalPages];
  if (currentPage >= totalPages - 2)
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  return (
    <div style={{ marginTop: 'auto' }}>
      <HStack width="100%" justify="center" paddingTop="3%" paddingBottom="3%" gap="6">
        <FaAngleLeft
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          style={{
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage === 1 ? 0.3 : 1,
            color: 'var(--color-core-green)',
          }}
        />
        {getPageNumbers(currentPage, totalPages).map((page, index) =>
          page === '...' ? (
            <Button
              key={`ellipsis-${index}`}
              backgroundColor="var(--color-core-white)"
              color="var(--color-core-green)"
              border="1px solid"
              borderColor="var(--color-core-green)"
              cursor="default"
            >
              ...
            </Button>
          ) : (
            <Button
              key={page}
              onClick={() => onPageChange(page as number)}
              backgroundColor={
                currentPage === page ? 'var(--color-core-green)' : 'var(--color-core-white)'
              }
              color={
                currentPage === page ? 'var(--color-core-white)' : 'var(--color-core-green)'
              }
              border="1px solid"
              borderColor="var(--color-core-green)"
            >
              {page}
            </Button>
          ),
        )}
        <FaAngleRight
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          style={{
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage === totalPages ? 0.3 : 1,
            color: 'var(--color-core-green)',
          }}
        />
      </HStack>
    </div>
  );
}
