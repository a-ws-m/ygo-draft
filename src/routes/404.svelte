<script>
  import '../app.postcss';
  import { base } from '$app/paths';
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-gray-100">
  <div class="text-center max-w-xl px-4">
    <h1 class="text-6xl font-bold text-purple-700 mb-8">404</h1>
    <div class="bg-white shadow-lg rounded-lg p-8">
      <h2 class="text-3xl font-semibold mb-4">Page Not Found</h2>
      <p class="text-gray-600 mb-6">
        Oops! The page you're looking for seems to have been banished to the shadow realm.
      </p>
      <a 
        href="{base}/"
        class="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
      >
        Back to Home
      </a>
    </div>
  </div>
</div>