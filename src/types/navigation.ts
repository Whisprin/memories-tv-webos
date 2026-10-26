export type View = 'photos' | 'albums' | 'people' | 'places';

/** Shared props for every route-level panel mounted by AppLayout. */
export interface RoutePanelProps {
	contentWidth: number;
}
