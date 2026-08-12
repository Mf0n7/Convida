import type { ReactNode } from "react";

type QueryStateProps<T> = {
  isLoading: boolean;
  isError?: boolean;
  data: T | null | undefined;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  children: (data: T) => ReactNode;
};

/** Substitui o trio isLoading/isError/data repetido nas páginas que consomem useQuery. */
export function QueryState<T>({
  isLoading,
  isError,
  data,
  loadingFallback = <p className="text-muted-foreground">Carregando…</p>,
  errorFallback = <p className="text-destructive">Não foi possível carregar.</p>,
  children,
}: QueryStateProps<T>) {
  if (isLoading) return <>{loadingFallback}</>;
  if (isError || data == null) return <>{errorFallback}</>;
  return <>{children(data)}</>;
}
