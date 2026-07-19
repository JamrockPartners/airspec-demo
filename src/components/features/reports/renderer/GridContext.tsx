import { createContext, useContext } from 'react';

interface GridCellInfo {
  seamless: boolean;
  colIndex: number;
  totalCols: number;
}

const GridContext = createContext<GridCellInfo>({ seamless: false, colIndex: 0, totalCols: 1 });

export const GridContextProvider = GridContext.Provider;
export function useGridContext() { return useContext(GridContext); }
