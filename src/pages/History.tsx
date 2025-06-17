import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Search, Download, Trash2, Calendar, Building, Briefcase, FileText, Filter, X, ChevronRight, ChevronDown, Eye } from 'lucide-react'
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

export function History() {
  const { user } = useAuth()
  const [history, setHistory] = useState<JobHistoryItem[]>([])
  const [filteredHistory, setFilteredHistory] = useState<JobHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [aiProviderFilter, setAiProviderFilter] = useState('')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobHistoryItem | null>(null)

  useEffect(() => {
    if (user) {
      loadHistory()
    }
  }, [user])

  useEffect(() => {
    filterHistory()
  }, [history, searchTerm, dateFilter, companyFilter, aiProviderFilter])

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('job_history')
        .select(`
          *,
          resume_history (
            id,
            resume_data,
            generation_cost,
            ai_provider,
            created_at
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading history:', error)
        return
      }

      setHistory(data || [])
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterHistory = () => {
    let filtered = [...history]

    // Search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(item =>
        item.company_name.toLowerCase().includes(searchLower) ||
        item.role.toLowerCase().includes(searchLower) ||
        item.job_description.toLowerCase().includes(searchLower) ||
        (item.note && item.note.toLowerCase().includes(searchLower))
      )
    }

    // Date filter
    if (dateFilter) {
      const filterDate = new Date(dateFilter)
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.created_at)
        return itemDate.toDateString() === filterDate.toDateString()
      })
    }

    // Company filter
    if (companyFilter) {
      filtered = filtered.filter(item =>
        item.company_name.toLowerCase().includes(companyFilter.toLowerCase())
      )
    }

    // AI Provider filter
    if (aiProviderFilter) {
      filtered = filtered.filter(item =>
        item.resume_history.some(resume => resume.ai_provider === aiProviderFilter)
      )
    }

    setFilteredHistory(filtered)
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
    if (selectedItems.size === filteredHistory.length) {
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

      // Remove deleted items from state
      setHistory(prev => prev.filter(item => !selectedItems.has(item.id)))
      setSelectedItems(new Set())
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
    setSearchTerm('')
    setDateFilter('')
    setCompanyFilter('')
    setAiProviderFilter('')
    setShowFilters(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
                      {filteredHistory.length} of {history.length} resumes
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
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Search by company, role, job description, or notes..."
                    />
                  </div>

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
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Company
                          </label>
                          <input
                            type="text"
                            value={companyFilter}
                            onChange={(e) => setCompanyFilter(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Filter by company..."
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            AI Provider
                          </label>
                          <select
                            value={aiProviderFilter}
                            onChange={(e) => setAiProviderFilter(e.target.value)}
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
              <div className="divide-y divide-gray-200 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {history.length === 0 ? 'No Resume History' : 'No Results Found'}
                    </h3>
                    <p className="text-gray-500">
                      {history.length === 0 
                        ? 'Generate your first resume to see it here'
                        : 'Try adjusting your search or filter criteria'
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
                                onClick={() => setSelectedJobDetail(item)}
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
                                {item.job_description.substring(0, 120)}...
                              </p>
                            </div>

                            {/* Resume History - Expanded */}
                            {expandedItems.has(item.id) && (
                              <div className="space-y-2">
                                {item.resume_history.map((resume) => (
                                  <div key={resume.id} className="bg-blue-50 border border-blue-200 rounded p-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs font-medium text-blue-900">
                                          Resume Generated
                                        </span>
                                        <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                                          {resume.ai_provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                                        </span>
                                        {resume.generation_cost && (
                                          <span className="text-xs text-green-700 bg-green-100 px-1 py-1 rounded">
                                            ${resume.generation_cost.toFixed(3)}
                                          </span>
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center space-x-1">
                                        <span className="text-xs text-blue-600">
                                          {formatDateShort(resume.created_at)}
                                        </span>
                                        <button
                                          onClick={() => handleDownloadResume(resume.resume_data, 'pdf', item.company_name, item.role)}
                                          className="flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                        >
                                          <Download className="h-3 w-3" />
                                          <span>PDF</span>
                                        </button>
                                        <button
                                          onClick={() => handleDownloadResume(resume.resume_data, 'docx', item.company_name, item.role)}
                                          className="flex items-center space-x-1 px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                                        >
                                          <Download className="h-3 w-3" />
                                          <span>DOCX</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Resume History - Collapsed */}
                            {!expandedItems.has(item.id) && item.resume_history.length > 0 && (
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">
                                  {item.resume_history.length} resume{item.resume_history.length > 1 ? 's' : ''} generated
                                </span>
                                {item.resume_history[0] && (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={() => handleDownloadResume(item.resume_history[0].resume_data, 'pdf', item.company_name, item.role)}
                                      className="flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                    >
                                      <Download className="h-3 w-3" />
                                      <span>PDF</span>
                                    </button>
                                    <button
                                      onClick={() => handleDownloadResume(item.resume_history[0].resume_data, 'docx', item.company_name, item.role)}
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
                {selectedJobDetail ? (
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