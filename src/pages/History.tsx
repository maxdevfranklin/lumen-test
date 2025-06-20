import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Search, Download, Trash2, Calendar, Building, Briefcase, FileText, Filter, X, ChevronRight, ChevronDown, Eye, ChevronLeft } from 'lucide-react'
import { downloadPDF, downloadDocx } from '../services/fileGenerator'

interface JobHistoryItem {
  id: string
  company_name: string
  role: string
  job_description: string
  note: string | null
  created_at: string
  resume_history: {
    id: string
    resume_data: any
    generation_cost: number | null
    ai_provider: string
    created_at: string
  }[]
}

interface JobHistoryPreview {
  id: string
  company_name: string
  role: string
  job_description_preview: string
  note: string | null
  created_at: string
  resume_count: number
  latest_resume?: {
    id: string
    resume_data: any
    generation_cost: number | null
    ai_provider: string
    created_at: string
  }
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
}

export function History() {
  const { user, loading: authLoading } = useAuth()
  const [historyPreviews, setHistoryPreviews] = useState<JobHistoryPreview[]>([])
  const [filteredHistory, setFilteredHistory] = useState<JobHistoryPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [aiProviderFilter, setAiProviderFilter] = useState('')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobHistoryItem | null>(null)
  const [loadingJobDetail, setLoadingJobDetail] = useState(false)
  
  // Pagination state
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 50
  })
  const [isSearching, setIsSearching] = useState(false)
  const [pageInput, setPageInput] = useState('')

  // Use refs to track if data has been loaded to prevent unnecessary reloads
  const hasLoadedRef = useRef(false)
  const lastLoadParamsRef = useRef<string>('')

  // Load job history previews (fast loading with minimal data)
  const loadHistoryPreviews = useCallback(async (page: number) => {
    if (!user) return
    
    const loadParams = `previews-${page}-${pagination.itemsPerPage}-${searchTerm}-${dateFilter}-${companyFilter}-${aiProviderFilter}`
    if (hasLoadedRef.current && lastLoadParamsRef.current === loadParams) {
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      
      let query = supabase
        .from('job_history')
        .select(`
          id,
          company_name,
          role,
          job_description,
          note,
          created_at
        `)
        .eq('user_id', user.id)

      // Apply filters
      if (searchTerm.trim()) {
        setIsSearching(true)
        query = query.or(`company_name.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%,job_description.ilike.%${searchTerm}%`)
      } else {
        setIsSearching(false)
      }

      if (dateFilter) {
        const filterDate = new Date(dateFilter)
        const nextDay = new Date(filterDate)
        nextDay.setDate(nextDay.getDate() + 1)
        query = query.gte('created_at', filterDate.toISOString()).lt('created_at', nextDay.toISOString())
      }

      if (companyFilter.trim()) {
        query = query.ilike('company_name', `%${companyFilter}%`)
      }

      // Get total count first
      const { count, error: countError } = await supabase
        .from('job_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (countError) {
        console.error('Error getting count:', countError)
        setError('Failed to load history count')
        return
      }

      // Apply pagination only if not searching
      if (!isSearching && !dateFilter && !companyFilter && !aiProviderFilter) {
        const itemsPerPage = pagination.itemsPerPage
        const from = (page - 1) * itemsPerPage
        const to = from + itemsPerPage - 1
        query = query.range(from, to)
      }

      query = query.order('created_at', { ascending: false })

      const { data: jobData, error } = await query

      if (error) {
        console.error('Error loading history previews:', error)
        setError('Failed to load history data')
        return
      }

      // Get resume counts for each job
      const jobIds = jobData?.map(job => job.id) || []
      const { data: resumeCounts } = await supabase
        .from('resume_history')
        .select('job_history_id, id, generation_cost, ai_provider, created_at, resume_data')
        .in('job_history_id', jobIds)
        .order('created_at', { ascending: false })

      // Process data into previews
      const previews: JobHistoryPreview[] = (jobData || []).map(job => {
        const jobResumes = resumeCounts?.filter(r => r.job_history_id === job.id) || []
        const latestResume = jobResumes[0]
        
        return {
          id: job.id,
          company_name: job.company_name,
          role: job.role,
          job_description_preview: job.job_description.substring(0, 120) + '...',
          note: job.note,
          created_at: job.created_at,
          resume_count: jobResumes.length,
          latest_resume: latestResume ? {
            id: latestResume.id,
            resume_data: latestResume.resume_data,
            generation_cost: latestResume.generation_cost,
            ai_provider: latestResume.ai_provider,
            created_at: latestResume.created_at
          } : undefined
        }
      })

      // Apply AI provider filter if needed
      let filteredPreviews = previews
      if (aiProviderFilter) {
        filteredPreviews = previews.filter(preview => 
          preview.latest_resume?.ai_provider === aiProviderFilter
        )
      }

      setHistoryPreviews(previews)
      setFilteredHistory(filteredPreviews)
      
      // Update pagination
      const totalItems = isSearching || dateFilter || companyFilter || aiProviderFilter ? filteredPreviews.length : (count || 0)
      setPagination(prev => ({
        ...prev,
        currentPage: page,
        totalItems,
        totalPages: Math.ceil(totalItems / prev.itemsPerPage)
      }))
      
      hasLoadedRef.current = true
      lastLoadParamsRef.current = loadParams
    } catch (error) {
      console.error('Error loading history previews:', error)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [user, pagination.itemsPerPage, searchTerm, dateFilter, companyFilter, aiProviderFilter, isSearching])

  // Load full job details when clicked
  const loadJobDetail = useCallback(async (jobId: string) => {
    if (!user) return
    
    setLoadingJobDetail(true)
    try {
      const { data: jobData, error: jobError } = await supabase
        .from('job_history')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single()

      if (jobError) {
        console.error('Error loading job detail:', jobError)
        return
      }

      const { data: resumeData, error: resumeError } = await supabase
        .from('resume_history')
        .select('*')
        .eq('job_history_id', jobId)
        .order('created_at', { ascending: false })

      if (resumeError) {
        console.error('Error loading resume history:', resumeError)
        return
      }

      const fullJobDetail: JobHistoryItem = {
        ...jobData,
        resume_history: resumeData || []
      }

      setSelectedJobDetail(fullJobDetail)
    } catch (error) {
      console.error('Error loading job detail:', error)
    } finally {
      setLoadingJobDetail(false)
    }
  }, [user])

  // Load data when component mounts or dependencies change
  useEffect(() => {
    if (authLoading) return
    
    if (!user) {
      setLoading(false)
      setError('User not authenticated')
      hasLoadedRef.current = false
      lastLoadParamsRef.current = ''
      return
    }

    setError(null)
    hasLoadedRef.current = false // Force reload when filters change
    loadHistoryPreviews(pagination.currentPage)
  }, [user, authLoading, loadHistoryPreviews, pagination.currentPage])

  // Handle search with Enter key
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    hasLoadedRef.current = false
    setSearchTerm(searchInput.trim())
    setPagination(prev => ({ ...prev, currentPage: 1 }))
  }

  // Handle company filter with Enter key
  const handleCompanyFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    hasLoadedRef.current = false
    loadHistoryPreviews(1)
  }

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value)
  }

  const handleCompanyFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompanyFilter(e.target.value)
  }

  const handleDateFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    hasLoadedRef.current = false
    setDateFilter(e.target.value)
    setPagination(prev => ({ ...prev, currentPage: 1 }))
  }

  const handleAiProviderFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hasLoadedRef.current = false
    setAiProviderFilter(e.target.value)
    setPagination(prev => ({ ...prev, currentPage: 1 }))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }))
      setSelectedItems(new Set())
      setPageInput('')
    }
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    hasLoadedRef.current = false
    setPagination(prev => ({
      ...prev,
      itemsPerPage: newItemsPerPage,
      currentPage: 1,
      totalPages: Math.ceil(prev.totalItems / newItemsPerPage)
    }))
    setSelectedItems(new Set())
  }

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const pageNumber = parseInt(pageInput)
    if (pageNumber && pageNumber >= 1 && pageNumber <= pagination.totalPages) {
      handlePageChange(pageNumber)
    } else {
      setPageInput('')
    }
  }

  const handleSelectItem = (itemId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedItems.size === filteredHistory.length && filteredHistory.length > 0) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredHistory.map(item => item.id)))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${selectedItems.size} selected item(s)? This action cannot be undone.`
    )

    if (!confirmDelete) return

    try {
      const { error } = await supabase
        .from('job_history')
        .delete()
        .in('id', Array.from(selectedItems))

      if (error) {
        console.error('Error deleting items:', error)
        alert('Error deleting items. Please try again.')
        return
      }

      hasLoadedRef.current = false
      setSelectedItems(new Set())
      loadHistoryPreviews(pagination.currentPage)
    } catch (error) {
      console.error('Error deleting items:', error)
      alert('Error deleting items. Please try again.')
    }
  }

  const handleDownloadResume = async (resumeData: any, format: 'pdf' | 'docx', companyName: string, role: string) => {
    try {
      if (format === 'pdf') {
        await downloadPDF(resumeData)
      } else {
        await downloadDocx(resumeData)
      }
    } catch (error) {
      console.error('Error downloading resume:', error)
      alert('Error downloading resume. Please try again.')
    }
  }

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId)
    } else {
      newExpanded.add(itemId)
    }
    setExpandedItems(newExpanded)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const clearFilters = () => {
    hasLoadedRef.current = false
    setSearchTerm('')
    setSearchInput('')
    setDateFilter('')
    setCompanyFilter('')
    setAiProviderFilter('')
    setShowFilters(false)
    setPagination(prev => ({ ...prev, currentPage: 1 }))
  }

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null

    const pages = []
    const maxVisiblePages = 5
    let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisiblePages / 2))
    let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1)

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    pages.push(
      <button
        key="prev"
        onClick={() => handlePageChange(pagination.currentPage - 1)}
        disabled={pagination.currentPage === 1}
        className="px-3 py-2 text-sm border border-gray-300 rounded-l-md bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    )

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`px-3 py-2 text-sm border-t border-b border-r border-gray-300 ${
            i === pagination.currentPage
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {i}
        </button>
      )
    }

    pages.push(
      <button
        key="next"
        onClick={() => handlePageChange(pagination.currentPage + 1)}
        disabled={pagination.currentPage === pagination.totalPages}
        className="px-3 py-2 text-sm border border-gray-300 rounded-r-md bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    )

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 space-y-3 sm:space-y-0">
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <div className="text-sm text-gray-700">
            Showing {Math.min((pagination.currentPage - 1) * pagination.itemsPerPage + 1, pagination.totalItems)} to{' '}
            {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
            {pagination.totalItems} results
          </div>
          
          {!isSearching && (
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Items per page:</label>
              <select
                value={pagination.itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
        </div>
        
        {!isSearching && (
          <div className="flex items-center space-x-4">
            <form onSubmit={handlePageInputSubmit} className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Go to page:</label>
              <input
                type="number"
                min="1"
                max={pagination.totalPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-center focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder={pagination.currentPage.toString()}
              />
              <button
                type="submit"
                className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Go
              </button>
            </form>
            
            <div className="flex items-center space-x-1">
              {pages}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <FileText className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-6">
            Please sign in to view your resume history.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <FileText className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading History</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null)
              hasLoadedRef.current = false
              loadHistoryPreviews(pagination.currentPage)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading history...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main History List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">Resume History</h1>
                    <p className="text-sm text-gray-600">
                      {filteredHistory.length} of {pagination.totalItems} resumes
                      {pagination.totalPages > 1 && (
                        <span className="text-gray-500 ml-1">(page {pagination.currentPage} of {pagination.totalPages})</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="mt-3 sm:mt-0 flex items-center space-x-2">
                    {selectedItems.size > 0 && (
                      <button
                        onClick={handleDeleteSelected}
                        className="flex items-center space-x-1 px-2 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete ({selectedItems.size})</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className="flex items-center space-x-1 px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors"
                    >
                      <Filter className="h-3 w-3" />
                      <span>Filters</span>
                    </button>
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="mt-3 space-y-3">
                  {/* Search Bar */}
                  <form onSubmit={handleSearchSubmit} className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={handleSearchInputChange}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Search company, role, or job description... (Press Enter to search)"
                    />
                  </form>

                  {/* Advanced Filters */}
                  {showFilters && (
                    <div className="bg-gray-50 p-3 rounded-md space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Advanced Filters</h3>
                        <button
                          onClick={clearFilters}
                          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={dateFilter}
                            onChange={handleDateFilterChange}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Company (Press Enter to search)
                          </label>
                          <form onSubmit={handleCompanyFilterSubmit}>
                            <input
                              type="text"
                              value={companyFilter}
                              onChange={handleCompanyFilterChange}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Filter by company..."
                            />
                          </form>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            AI Provider
                          </label>
                          <select
                            value={aiProviderFilter}
                            onChange={handleAiProviderFilterChange}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">All Providers</option>
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* History List */}
              <div className="divide-y divide-gray-200" style={{ height: 'calc(100vh - 500px)', minHeight: '600px', overflowY: 'auto' }}>
                {filteredHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {isSearching || dateFilter || companyFilter || aiProviderFilter ? 'No Results Found' : 'No Resume History'}
                    </h3>
                    <p className="text-gray-500">
                      {isSearching || dateFilter || companyFilter || aiProviderFilter
                        ? 'Try adjusting your search or filter criteria'
                        : 'Generate your first resume to see it here'
                      }
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Select All Header */}
                    <div className="px-4 py-2 bg-gray-50">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedItems.size === filteredHistory.length && filteredHistory.length > 0}
                          onChange={handleSelectAll}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Select All ({filteredHistory.length})
                        </span>
                      </label>
                    </div>

                    {filteredHistory.map((item) => (
                      <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => handleSelectItem(item.id)}
                            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          
                          <div className="flex-1 min-w-0">
                            {/* Header Row */}
                            <div className="flex items-center justify-between mb-2">
                              <div 
                                className="flex items-center space-x-3 cursor-pointer flex-1"
                                onClick={() => loadJobDetail(item.id)}
                              >
                                <div className="flex items-center space-x-2">
                                  <Building className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium text-gray-900 text-sm">{item.company_name}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Briefcase className="h-4 w-4 text-gray-400" />
                                  <span className="text-gray-700 text-sm">{item.role}</span>
                                </div>
                                <button className="text-blue-600 hover:text-blue-800">
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">{formatDateShort(item.created_at)}</span>
                                <button
                                  onClick={() => toggleExpanded(item.id)}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  {expandedItems.has(item.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Note */}
                            {item.note && (
                              <div className="mb-2">
                                <p className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">
                                  <strong>Note:</strong> {item.note}
                                </p>
                              </div>
                            )}

                            {/* Job Description Preview */}
                            <div className="mb-2">
                              <p className="text-xs text-gray-600 line-clamp-1">
                                {item.job_description_preview}
                              </p>
                            </div>

                            {/* Resume History - Collapsed */}
                            {!expandedItems.has(item.id) && item.resume_count > 0 && (
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">
                                  {item.resume_count} resume{item.resume_count > 1 ? 's' : ''} generated
                                </span>
                                {item.latest_resume && (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={() => handleDownloadResume(item.latest_resume!.resume_data, 'pdf', item.company_name, item.role)}
                                      className="flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                    >
                                      <Download className="h-3 w-3" />
                                      <span>PDF</span>
                                    </button>
                                    <button
                                      onClick={() => handleDownloadResume(item.latest_resume!.resume_data, 'docx', item.company_name, item.role)}
                                      className="flex items-center space-x-1 px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                                    >
                                      <Download className="h-3 w-3" />
                                      <span>DOCX</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Pagination */}
              {renderPagination()}
            </div>
          </div>

          {/* Job Detail Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md sticky top-6">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Job Details</h2>
                  {selectedJobDetail && (
                    <button
                      onClick={() => setSelectedJobDetail(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4">
                {loadingJobDetail ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600">Loading details...</p>
                  </div>
                ) : selectedJobDetail ? (
                  <div className="space-y-4">
                    {/* Company and Role */}
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{selectedJobDetail.company_name}</span>
                      </div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Briefcase className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-700">{selectedJobDetail.role}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-500">{formatDate(selectedJobDetail.created_at)}</span>
                      </div>
                    </div>

                    {/* Note */}
                    {selectedJobDetail.note && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Note</h3>
                        <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3">
                          {selectedJobDetail.note}
                        </p>
                      </div>
                    )}

                    {/* Job Description */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">Job Description</h3>
                      <div className="max-h-96 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-3">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {selectedJobDetail.job_description}
                        </p>
                      </div>
                    </div>

                    {/* Resume History */}
                    {selectedJobDetail.resume_history.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Generated Resumes</h3>
                        <div className="space-y-2">
                          {selectedJobDetail.resume_history.map((resume) => (
                            <div key={resume.id} className="bg-blue-50 border border-blue-200 rounded p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-medium text-blue-900">
                                    {resume.ai_provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                                  </span>
                                  {resume.generation_cost && (
                                    <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                                      ${resume.generation_cost.toFixed(3)}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-blue-600">
                                  {formatDate(resume.created_at)}
                                </span>
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleDownloadResume(resume.resume_data, 'pdf', selectedJobDetail.company_name, selectedJobDetail.role)}
                                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>PDF</span>
                                </button>
                                <button
                                  onClick={() => handleDownloadResume(resume.resume_data, 'docx', selectedJobDetail.company_name, selectedJobDetail.role)}
                                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>DOCX</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Select a Job</h3>
                    <p className="text-sm text-gray-500">
                      Click on any job item to view detailed information
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}