import { useState, useEffect} from 'react';
import type{ FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

// Define the full Product interface, including our new AI tags
interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url: string;
  artist_id: number;
  created_at: string;
  tags: string[] | null; // Tags can be null or an array of strings
}

// Define the shape of our form data
interface ProductFormData {
  name: string;
  description: string;
  price: number;
  image_url: string;
}

export default function Dashboard() {
  const { token, logout } = useAuth();

  // --- STATE MANAGEMENT ---
  // R - Read: State for the artist's products
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // C - Create: State for the "new product" form
  const [newProduct, setNewProduct] = useState<ProductFormData>({
    name: '',
    description: '',
    price: 0.00,
    image_url: 'https://placehold.co/600x400/CCCCCC/FFFFFF?text=My+Art',
  });

  // U - Update: State for inline editing
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ProductFormData>>({});
  
  // D - Delete: State for delete confirmation (to avoid using alert())
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  
  const API_URL = 'http://localhost:3001';

  // --- DATA FETCHING (R - Read) ---
  const fetchMyProducts = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/artists/my-products`, {
        headers: {
          'x-auth-token': token,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch products.');
      const data: Product[] = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch products on initial component load
  useEffect(() => {
    fetchMyProducts();
  }, [token]);

  // --- FORM HANDLING ---
  const handleNewProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: name === 'price' ? parseFloat(value) : value,
    }));
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: name === 'price' ? parseFloat(value) : value,
    }));
  };

  // --- API OPERATIONS (C, U, D) ---

  // C - Create
  const handleCreateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify(newProduct),
      });
      if (!response.ok) throw new Error('Failed to create product.');
      
      const createdProduct: Product = await response.json();
      
      // Add new product to the top of the list
      setProducts([createdProduct, ...products]);
      
      // Reset the form
      setNewProduct({
        name: '',
        description: '',
        price: 0.00,
        image_url: 'https://placehold.co/600x400/CCCCCC/FFFFFF?text=My+Art',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    }
  };

  // U - Update
  const handleUpdateProduct = async (productId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify(editFormData),
      });
      if (!response.ok) throw new Error('Failed to update product.');
      
      const updatedProduct: Product = await response.json();

      // Update the product in the state
      setProducts(products.map(p => p.id === productId ? updatedProduct : p));
      
      // Exit edit mode
      setEditingProductId(null);
      setEditFormData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    }
  };

  // D - Delete
  const handleConfirmDelete = async (productId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'x-auth-token': token,
        },
      });
      if (!response.ok) throw new Error('Failed to delete product.');
      
      // Remove product from state
      setProducts(products.filter(p => p.id !== productId));
      
      // Close confirmation dialog
      setProductToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    }
  };

  // --- RENDER LOGIC ---

  if (isLoading) {
    return <div className="p-8 text-center">Loading your dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Artist Dashboard</h1>
        <button 
          onClick={logout} 
          className="bg-red-600 text-white px-5 py-2 rounded-lg shadow hover:bg-red-500 transition-colors">
          Log Out
        </button>
      </div>

      {/* --- C: CREATE PRODUCT FORM --- */}
      <div className="bg-white p-6 rounded-lg shadow-lg mb-12">
        <h2 className="text-2xl font-semibold mb-4">Create New Product</h2>
        <form onSubmit={handleCreateProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-1">
            <label className="block text-gray-700 mb-2" htmlFor="name">Product Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={newProduct.name}
              onChange={handleNewProductChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-gray-700 mb-2" htmlFor="price">Price ($)</label>
            <input
              type="number"
              id="price"
              name="price"
              step="0.01"
              min="0"
              value={newProduct.price}
              onChange={handleNewProductChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-2" htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={newProduct.description}
              onChange={handleNewProductChange}
              className="w-full px-3 py-2 border rounded-lg"
              rows={4}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-2" htmlFor="image_url">Image URL</label>
            <input
              type="text"
              id="image_url"
              name="image_url"
              value={newProduct.image_url}
              onChange={handleNewProductChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div className="md:col-span-2 text-right">
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg shadow hover:bg-indigo-500 transition-colors">
              Add Product
            </button>
          </div>
        </form>
      </div>

      {/* --- R: READ PRODUCTS LIST --- */}
      <h2 className="text-3xl font-semibold mb-6">Your Products</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.length === 0 ? (
          <p className="text-gray-500 md:col-span-3">You haven't added any products yet.</p>
        ) : (
          products.map(product => (
            <div key={product.id} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
              
              {/* --- U: UPDATE FORM (Inline) --- */}
              {editingProductId === product.id ? (
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Editing...</h3>
                  <div className="space-y-4">
                    <input
                      type="text"
                      name="name"
                      defaultValue={product.name}
                      onChange={handleEditFormChange}
                      className="w-full px-3 py-2 border rounded-lg mb-2"
                      placeholder="Name"
                    />
                    <textarea
                      name="description"
                      defaultValue={product.description}
                      onChange={handleEditFormChange}
                      className="w-full px-3 py-2 border rounded-lg mb-2"
                      rows={3}
                      placeholder="Description"
                    />
                    <input
                      type="number"
                      name="price"
                      step="0.01"
                      defaultValue={product.price}
                      onChange={handleEditFormChange}
                      className="w-full px-3 py-2 border rounded-lg mb-2"
                      placeholder="Price"
                    />
                    <input
                      type="text"
                      name="image_url"
                      defaultValue={product.image_url}
                      onChange={handleEditFormChange}
                      className="w-full px-3 py-2 border rounded-lg mb-4"
                      placeholder="Image URL"
                    />
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setEditingProductId(null)} className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400">Cancel</button>
                      <button onClick={() => handleUpdateProduct(product.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500">Save</button>
                    </div>
                  </div>
                </div>
              ) : (
                
                /* --- R: READ CARD (Default View) --- */
                <>
                  <img src={product.image_url} alt={product.name} className="w-full h-56 object-cover" />
                  <div className="p-6 flex-grow">
                    <h3 className="text-xl font-semibold text-gray-800">{product.name}</h3>
                    <p className="text-gray-600 mt-2">{product.description}</p>
                    <span className="text-2xl font-bold text-indigo-600 mt-4 block">${parseFloat(product.price).toFixed(2)}</span>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {product.tags && product.tags.map(tag => (
                        <span key={tag} className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* --- D: DELETE CONFIRMATION --- */}
                  {productToDelete === product.id ? (
                    <div className="p-4 bg-red-100 border-t border-red-200">
                      <p className="text-center text-red-800 font-medium">Are you sure?</p>
                      <div className="flex justify-center space-x-4 mt-2">
                        <button onClick={() => setProductToDelete(null)} className="px-4 py-1 bg-gray-300 rounded-lg hover:bg-gray-400">Cancel</button>
                        <button onClick={() => handleConfirmDelete(product.id)} className="px-4 py-1 bg-red-600 text-white rounded-lg hover:bg-red-500">Yes, Delete</button>
                      </div>
                    </div>
                  ) : (
                    
                    /* --- U & D: ACTION BUTTONS --- */
                    <div className="p-4 bg-gray-50 border-t flex justify-end space-x-2">
                      <button 
                        onClick={() => {
                          setEditingProductId(product.id);
                          setEditFormData({ // Pre-fill edit form
                            name: product.name,
                            description: product.description,
                            price: parseFloat(product.price),
                            image_url: product.image_url,
                          });
                        }}
                        className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-400">
                        Edit
                      </button>
                      <button 
                        onClick={() => setProductToDelete(product.id)}
                        className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-400">
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}