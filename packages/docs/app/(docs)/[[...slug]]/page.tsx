import { getPageImage, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { publicEnvConfig } from '@starships/env/public';

function normalizePublicUrl(value: string): string {
  return String(value || '').replace(/\/+$/, '');
}

function getDocsBaseUrl(): string {
  const configured = String(process.env.DOCS_URL || '').trim();
  if (configured) return normalizePublicUrl(configured);
  return normalizePublicUrl(publicEnvConfig.PUBLIC_URL);
}

function buildCanonicalUrl(pageUrl: string): string {
  const publicUrl = getDocsBaseUrl();
  const raw = String(pageUrl || '/').trim() || '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;

  const full = `${publicUrl}${path === '/' ? '' : path}`;
  return full.replace(/\/+$/, '');
}

export default async function Page(props: PageProps<'/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const canonical = buildCanonicalUrl(page.url);

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical,
    },
    openGraph: {
      url: canonical,
      images: getPageImage(page).url,
    },
  };
}
