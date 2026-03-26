interface RelatedCase {
  title: string;
  link: string;
  thumbnail: string;
}

interface Step {
  title: string;
  description: string;
  command?: string;
}

interface ShowcaseDetailHeaderProps {
  title: string;
  description: string;
  role: string;
  model?: string;
  author?: string;
  features?: string[];
  difficulty?: string;
  duration?: string;
  videoUrl?: string;
  thumbnail?: string;
  steps?: Step[];
}

interface ShowcaseDetailFooterProps {
  relatedCases?: RelatedCase[];
  ctaText?: string;
}

export interface ShowcaseDetailProps extends ShowcaseDetailHeaderProps, ShowcaseDetailFooterProps {}

function ShowcaseDetailHeader({
  title,
  description,
  role,
  model,
  author = "Qwen Team",
  features = [],
  difficulty,
  duration,
  videoUrl,
  thumbnail,
  steps = [],
}: ShowcaseDetailHeaderProps) {
  const getDifficultyColor = (diff?: string) => {
    if (!diff) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    switch (diff.toLowerCase()) {
      case 'beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'advanced':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">{description}</p>

        {/* Meta Info */}
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-sm">
            {role}
          </span>
          {model && (
            <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-sm">
              {model}
            </span>
          )}
          {difficulty && (
            <span className={`px-3 py-1 rounded-full text-sm ${getDifficultyColor(difficulty)}`}>
              {difficulty}
            </span>
          )}
          {duration && (
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm">
              {duration}
            </span>
          )}
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {features.map((feature, index) => (
              <span
                key={index}
                className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        )}

        {/* Author */}
        {author && (
          <p className="text-sm text-gray-500 dark:text-gray-400">By {author}</p>
        )}
      </div>

      {/* Video/Thumbnail */}
      {(videoUrl || thumbnail) && (
        <div className="mb-8 rounded-lg overflow-hidden">
          {videoUrl ? (
            <video
              src={videoUrl}
              poster={thumbnail}
              controls
              className="w-full max-h-[500px] object-cover"
            />
          ) : thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              className="w-full max-h-[500px] object-cover"
            />
          ) : null}
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6">操作步骤</h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div
                key={index}
                className="border-l-4 border-blue-500 pl-4 py-2"
              >
                <h3 className="text-lg font-semibold mb-2">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-3">
                  {step.description}
                </p>
                {step.command && (
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm overflow-x-auto">
                    <code>{step.command}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShowcaseDetailFooter({
  relatedCases = [],
  ctaText,
}: ShowcaseDetailFooterProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 pb-8">
      {/* Related Cases */}
      {relatedCases && relatedCases.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6">相关案例</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedCases.map((caseItem, index) => (
              <a
                key={index}
                href={caseItem.link}
                className="block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                {caseItem.thumbnail && (
                  <img
                    src={caseItem.thumbnail}
                    alt={caseItem.title}
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-semibold">{caseItem.title}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {ctaText && (
        <div className="text-center py-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg">
          <p className="text-lg font-medium mb-4">{ctaText}</p>
          <a
            href="/zh/docs/getting-started/installation"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            开始使用 Qwen Code
          </a>
        </div>
      )}
    </div>
  );
}

// Default export for backward compatibility
export function ShowcaseDetail(props: ShowcaseDetailProps) {
  return (
    <>
      <ShowcaseDetailHeader {...props} />
      <ShowcaseDetailFooter {...props} />
    </>
  );
}

export { ShowcaseDetailHeader, ShowcaseDetailFooter };
export default ShowcaseDetail;
