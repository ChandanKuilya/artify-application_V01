import { useState, useEffect } from 'react';

// Define an interface for our Product data
interface Product {
  id: number;
  name: string;
  description: string;
  price: string; // Comes as a string from a NUMERIC field
  image_url: string;
}

function Home() {
  // State for products, loading, and errors
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // API endpoint for our backend
  const API_URL = 'http://localhost:3001/api/products';

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch(API_URL);
        
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        
        const data: Product[] = await response.json();
        setProducts(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []); // The empty array means this effect runs once on mount

  return (
    // The redundant <header> section has been removed from here.
    // The main content now starts directly.
    <div className="container mx-auto px-6 py-8">
      <h2 className="text-2xl font-semibold text-gray-700 mb-6">Featured Products</h2>
      
      {/* Loading State */}
      {loading && <p className="text-center text-lg">Loading products...</p>}
      
      {/* Error State */}
      {error && <p className="text-center text-red-500 text-lg">Error: {error}</p>}
      
      {/* Success State */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* Map over the products and render a card for each */}
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-lg overflow-hidden transition-transform duration-300 hover:scale-105">
              <img src={product.image_url} alt={product.name} className="w-full h-56 object-cover" />
              
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-800">{product.name}</h3>
                <p className="text-gray-600 mt-2 h-20 overflow-hidden">{product.description}</p>
                
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-2xl font-bold text-indigo-600">${parseFloat(product.price).toFixed(2)}</span>
                  <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-500 focus:outline-none focus:bg-indigo-500">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* No products found state */}
      {!loading && !error && products.length === 0 && (
        <p className="text-center text-gray-500 text-lg">No products found.</p>
      )}
    </div>
  );
}

export default Home;