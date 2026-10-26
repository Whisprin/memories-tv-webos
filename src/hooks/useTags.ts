import {useRepositoryQuery} from './queryConfig';

export const useTags = () => useRepositoryQuery(['tags'], (r) => r.getTags());
