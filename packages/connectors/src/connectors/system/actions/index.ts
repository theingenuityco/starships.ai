import type { CodeAction } from '../../../framework';
import { webFetch } from './web-fetch';
import { webSearch } from './web-search';

export const systemActions: CodeAction[] = [webFetch, webSearch];
