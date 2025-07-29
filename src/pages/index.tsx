import React, { useState, useCallback } from "react";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Upload, FileText, Download, CheckCircle, AlertCircle } from "lucide-react";
import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFRadioGroup } from "pdf-lib";

interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'checkbox' | 'radio';
  value: string;
  required?: boolean;
  options?: string[];
}

interface ProcessingStep {
  id: string;
  title: string;
  completed: boolean;
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState<'upload' | 'fill' | 'download'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: 'parse', title: 'Parsing PDF structure', completed: false },
    { id: 'extract', title: 'Extracting form fields', completed: false },
    { id: 'prepare', title: 'Preparing form interface', completed: false }
  ]);
  const { toast } = useToast();

  const updateProcessingStep = (stepId: string, completed: boolean) => {
    setProcessingSteps(prev => 
      prev.map(step => 
        step.id === stepId ? { ...step, completed } : step
      )
    );
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    setPdfFile(file);
    setIsProcessing(true);
    
    try {
      // Step 1: Parse PDF
      updateProcessingStep('parse', false);
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      setPdfDoc(pdfDoc);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      updateProcessingStep('parse', true);

      // Step 2: Extract form fields
      updateProcessingStep('extract', false);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      const extractedFields: FormField[] = [];
      const initialFormData: Record<string, string> = {};

      fields.forEach((field) => {
        const fieldName = field.getName();
        let fieldType: FormField['type'] = 'text';
        let options: string[] | undefined;

        if (field instanceof PDFTextField) {
          fieldType = field.isMultiline() ? 'textarea' : 'text';
        } else if (field instanceof PDFCheckBox) {
          fieldType = 'checkbox';
        } else if (field instanceof PDFRadioGroup) {
          fieldType = 'radio';
          options = field.getOptions();
        }

        extractedFields.push({
          name: fieldName,
          type: fieldType,
          value: '',
          options
        });

        initialFormData[fieldName] = '';
      });

      await new Promise(resolve => setTimeout(resolve, 800));
      updateProcessingStep('extract', true);

      // Step 3: Prepare form interface
      updateProcessingStep('prepare', false);
      setFormFields(extractedFields);
      setFormData(initialFormData);
      
      await new Promise(resolve => setTimeout(resolve, 600));
      updateProcessingStep('prepare', true);

      setTimeout(() => {
        setIsProcessing(false);
        setCurrentStep('fill');
        toast({
          title: "PDF processed successfully!",
          description: `Found ${extractedFields.length} form fields to fill.`,
        });
      }, 500);

    } catch (error) {
      console.error('Error processing PDF:', error);
      setIsProcessing(false);
      toast({
        title: "Error processing PDF",
        description: "The PDF might not contain fillable form fields.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleInputChange = (fieldName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleDownloadPDF = async () => {
    if (!pdfDoc) return;

    try {
      setIsProcessing(true);
      const form = pdfDoc.getForm();

      // Fill the form fields
      Object.entries(formData).forEach(([fieldName, value]) => {
        try {
          const field = form.getField(fieldName);
          if (field instanceof PDFTextField) {
            field.setText(value);
          } else if (field instanceof PDFCheckBox) {
            if (value === 'true' || value === 'on') {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (field instanceof PDFRadioGroup) {
            if (value) {
              field.select(value);
            }
          }
        } catch (error) {
          console.warn(`Could not fill field ${fieldName}:`, error);
        }
      });

      // Generate the filled PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Download the file
      const link = document.createElement('a');
      link.href = url;
      link.download = `filled_${pdfFile?.name || 'document.pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsProcessing(false);
      setCurrentStep('download');
      
      toast({
        title: "PDF downloaded successfully!",
        description: "Your filled PDF has been saved to your downloads.",
      });

    } catch (error) {
      console.error('Error generating PDF:', error);
      setIsProcessing(false);
      toast({
        title: "Error generating PDF",
        description: "There was an issue creating your filled PDF.",
        variant: "destructive",
      });
    }
  };

  const resetApp = () => {
    setPdfFile(null);
    setPdfDoc(null);
    setFormFields([]);
    setFormData({});
    setCurrentStep('upload');
    setProcessingSteps(prev => prev.map(step => ({ ...step, completed: false })));
  };

  const renderFormField = (field: FormField) => {
    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            id={field.name}
            value={formData[field.name] || ''}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            placeholder={`Enter ${field.name}`}
            className="min-h-[100px]"
          />
        );
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={field.name}
              checked={formData[field.name] === 'true'}
              onChange={(e) => handleInputChange(field.name, e.target.checked.toString())}
              className="rounded border-input"
            />
            <Label htmlFor={field.name} className="text-sm font-normal">
              {field.name}
            </Label>
          </div>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <input
                  type="radio"
                  id={`${field.name}-${option}`}
                  name={field.name}
                  value={option}
                  checked={formData[field.name] === option}
                  onChange={(e) => handleInputChange(field.name, e.target.value)}
                  className="border-input"
                />
                <Label htmlFor={`${field.name}-${option}`} className="text-sm font-normal">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <Input
            id={field.name}
            type="text"
            value={formData[field.name] || ''}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            placeholder={`Enter ${field.name}`}
          />
        );
    }
  };

  return (
    <>
      <Head>
        <title>PDF Form Filler - Fill & Save PDF Forms</title>
        <meta name="description" content="Upload PDF forms, fill them digitally, and download the completed documents" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {/* Hero Background */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80"
            alt="Office documents background"
            className="w-full h-full object-cover opacity-5"
          />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-border/40 backdrop-blur-sm bg-background/80"
          >
            <div className="container mx-auto px-4 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">PDF Form Filler</h1>
                    <p className="text-sm text-muted-foreground">Fill and save PDF forms digitally</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-12">
            <AnimatePresence mode="wait">
              {currentStep === 'upload' && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto"
                >
                  <div className="text-center mb-8">
                    <motion.h2 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-4xl font-bold text-foreground mb-4"
                    >
                      Upload Your PDF Form
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-xl text-muted-foreground"
                    >
                      Select a PDF with fillable form fields to get started
                    </motion.p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
                      <CardContent className="p-12">
                        <div className="text-center">
                          <Upload className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="pdf-upload" className="cursor-pointer">
                                <Button asChild className="text-lg px-8 py-6 h-auto">
                                  <span>Choose PDF File</span>
                                </Button>
                              </Label>
                              <Input
                                id="pdf-upload"
                                type="file"
                                accept=".pdf"
                                onChange={handleFileUpload}
                                className="hidden"
                              />
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Drag and drop your PDF here, or click to browse
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {isProcessing && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8"
                    >
                      <Card>
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold">Processing PDF...</h3>
                              <div className="text-sm text-muted-foreground">
                                {processingSteps.filter(s => s.completed).length} / {processingSteps.length}
                              </div>
                            </div>
                            <Progress 
                              value={(processingSteps.filter(s => s.completed).length / processingSteps.length) * 100} 
                              className="w-full"
                            />
                            <div className="space-y-2">
                              {processingSteps.map((step) => (
                                <div key={step.id} className="flex items-center space-x-3">
                                  {step.completed ? (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <div className="w-5 h-5 border-2 border-muted-foreground rounded-full animate-spin border-t-primary" />
                                  )}
                                  <span className={`text-sm ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {step.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {currentStep === 'fill' && (
                <motion.div
                  key="fill"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="text-center mb-8">
                    <motion.h2 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-4xl font-bold text-foreground mb-4"
                    >
                      Fill Your Form
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-xl text-muted-foreground"
                    >
                      Complete the form fields below and download your filled PDF
                    </motion.p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <FileText className="w-5 h-5" />
                            <span>Form Fields</span>
                          </CardTitle>
                          <CardDescription>
                            Fill out the fields extracted from your PDF
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 max-h-[600px] overflow-y-auto">
                          {formFields.map((field, index) => (
                            <motion.div
                              key={field.name}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 * index }}
                              className="space-y-2"
                            >
                              <Label htmlFor={field.name} className="text-sm font-medium">
                                {field.name}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </Label>
                              {renderFormField(field)}
                            </motion.div>
                          ))}
                        </CardContent>
                      </Card>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="space-y-6"
                    >
                      <Card>
                        <CardHeader>
                          <CardTitle>PDF Preview</CardTitle>
                          <CardDescription>
                            Your original PDF document
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                              <p className="text-muted-foreground">
                                {pdfFile?.name}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <Button 
                              onClick={handleDownloadPDF}
                              disabled={isProcessing}
                              className="w-full text-lg py-6 h-auto"
                            >
                              {isProcessing ? (
                                <>
                                  <div className="w-5 h-5 border-2 border-primary-foreground rounded-full animate-spin border-t-transparent mr-2" />
                                  Generating PDF...
                                </>
                              ) : (
                                <>
                                  <Download className="w-5 h-5 mr-2" />
                                  Download Filled PDF
                                </>
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={resetApp}
                              className="w-full"
                            >
                              Upload New PDF
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {currentStep === 'download' && (
                <motion.div
                  key="download"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="w-24 h-24 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6"
                  >
                    <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                  </motion.div>
                  
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-4xl font-bold text-foreground mb-4"
                  >
                    Success!
                  </motion.h2>
                  
                  <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-xl text-muted-foreground mb-8"
                  >
                    Your filled PDF has been downloaded successfully
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Button 
                      onClick={resetApp}
                      className="text-lg px-8 py-6 h-auto"
                    >
                      Fill Another PDF
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
      
      <Toaster />
    </>
  );
}