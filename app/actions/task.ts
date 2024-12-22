"use server";
import mongoose from "mongoose";
import { authOptions } from "@/auth";
import { connectToDatabase } from "@/lib/db";
import Task from "@/models/Task";
import { getServerSession } from "next-auth";
import { Template } from "@/models/Template";
import {User} from "@/models/User";
import { TaskRepeat } from "@/models/TaskRepeat";
import { template } from "../template/page";
import NotificationTemplate from "@/models/NotificationTemplate";
import Rework from "@/models/Rework";
import nodemailer from 'nodemailer';
import { AIJob } from "@/models/aiModel";



export async function getTestTemplateTasks() {
  await connectToDatabase();
  try {
    const repeatTasks = await TaskRepeat.find({});

    console.log("repeat tasks from TaskRepeat", repeatTasks);

    if (!repeatTasks.length) {
      return JSON.stringify({
        success: false,
        message: "No tasks found for test template in TaskRepeat",
      });
    }

    return JSON.stringify({
      success: true,
      tasks: repeatTasks,
      count: repeatTasks.length,
    });
  } catch (error) {
    console.error("Error fetching test template tasks:", error);
    return JSON.stringify({
      success: false,
      error: "Failed to fetch test template tasks",
      details: (error as Error).message,
    });
  }
}

export async function updateTask(
  template: template,
  _id: string,
  projectid: string,
  time: number
) {
  await connectToDatabase();

  const res = await Task.findOneAndUpdate(
    { _id },
    {
      ...template,
      content: template.content,
      submitted: true,
      project: projectid,
      timeTaken: time,
    }
  );

  return JSON.stringify(res);
}

export async function createTestTasks(
  tasks: {
    project: string;
    name: string;
    content: string;
    timer: number;
    annotator: string;
    reviewer: null;
    project_Manager: string;
    submitted: boolean;
    status: string;
    timeTaken: number;
    feedback: string;
    ai?: null; // Make ai optional but include it
  }[]
) {
  await connectToDatabase();

  try {
    // Ensure all required fields are present before insertion
    const tasksToCreate = tasks.map((task) => ({
      ...task,
      annotator: task.annotator,
    }));

    const createdTasks = await Task.insertMany(tasksToCreate);

    return JSON.stringify({
      success: true,
      tasks: createdTasks,
    });
  } catch (error) {
    console.error("Error creating test tasks:", error);
    throw error;
  }
}

export async function createTasks(
  tasks: {
    project: string;
    name: string;
    content: string;
    timer: number;
    reviewer: string;
  }[]
) {
  await connectToDatabase();
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const taskData = tasks.map((task) => ({
    ...task,
    project_Manager: session.user.id,
    reviewer: task.reviewer || null,
  }));

  await Task.insertMany(taskData);
}

export async function saveRepeatTasks(
  repeatTasks: {
    project: string;
    name: string;
    content: string;
    timer: number;
    reviewer: string;
  }[]
) {
  const documents = await TaskRepeat.find({});
  console.log("Documents in collection:", documents);

  try {
    console.log("Connecting to database...");
    await connectToDatabase();
    console.log("Successfully connected to the database.");

    console.log("Fetching session...");
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      console.error("Unauthorized: No valid session found.");
      throw new Error("Unauthorized");
    }
    console.log("Session fetched successfully:", session.user);

    console.log("Processing repeat task data...");
    const repeatTaskData = repeatTasks.map((repeatTask, index) => ({
      ...repeatTask,
      project_Manager: session.user.id,
      reviewer: repeatTask.reviewer || null,
    }));
    console.log(
      `Processed ${repeatTaskData.length} repeat tasks:`,
      repeatTaskData
    );

    console.log("Inserting repeat tasks into the database...");
    await TaskRepeat.insertMany(repeatTaskData).catch((error) => {
      console.error("Validation or insertion error:", error);
      throw error;
    });

    console.log("Repeat tasks inserted successfully.");

    return { success: true, message: "Repeat tasks saved successfully" };
  } catch (error) {
    console.error("Error in saveRepeatTasks function:", error);
    throw new Error(
      (error as Error)?.message ||
        "An unknown error occurred while saving repeat tasks."
    );
  }
}

export async function getAllTasks(projectid: string) {
  await connectToDatabase();
  const res = await Task.find({ project: projectid });
  return JSON.stringify(res);
}

export async function getPaginatedTasks(projectid: string, page: number, activeTab: string) {
  await connectToDatabase();
  const limit = parseInt(process.env.NEXT_PUBLIC_PAGE_LIMIT!);
  const skip = (page - 1) * limit;

  let tasks = [];
  let total = 0;

  if (activeTab === 'all') {
    tasks = await Task.find({ project: projectid }).skip(skip).limit(limit);
    total = await Task.countDocuments({ project: projectid });
  } else if (activeTab === 'submitted') {
    tasks = await Task.find({ project: projectid, submitted: true }).skip(skip).limit(limit);
    total = await Task.countDocuments({ project: projectid, submitted: true });
  } else if (activeTab === 'unassigned') {
    tasks = await Task.find({
      project: projectid,
      $or: [{ annotator: null }],
    })
      .skip(skip)
      .limit(limit);
    total = await Task.countDocuments({
      project: projectid,
      $or: [{ annotator: null }],
    });
  }

  return JSON.stringify({
    tasks: tasks || [],
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}



export async function getATask(projectid: string) {
  await connectToDatabase();
  const res = await Task.findOne({ project: projectid });
  return JSON.stringify(res);
}

export async function getAllAcceptedTasks(projectid: string) {
  await connectToDatabase();
  const res = await Task.find({ project: projectid, status: "accepted" });
  return JSON.stringify(res);
}

export async function deleteTask(_id: string) {
  await connectToDatabase();
  await AIJob.deleteMany({ taskid: _id });
  const res = await Task.deleteOne({ _id });
  return JSON.stringify(res);
}
export async function changeAnnotator(
  _id: string,
  annotator: string,
  ai: boolean = false,
  isReviewer: boolean = false
) {
  await connectToDatabase();

  // If AI is being assigned
  if (ai) {
    const res = await Task.findOneAndUpdate(
      { _id },
      {
        $set: {
          annotator: null,
          ai: annotator,
        },
      },
      {
        new: true,
      }
    );
    return JSON.stringify(res);
  }

  // If assigning a reviewer
  if (isReviewer) {
    // If annotator is being unassigned (empty string)
    if (!annotator) {
      const res = await Task.findOneAndUpdate(
        { _id },
        {
          $set: { reviewer: null },
        },
        {
          new: true,
        }
      );
      return JSON.stringify(res);
    }

    // Check if the reviewer is not the same as the current annotator
    const task = await Task.findById(_id);
    if (task && task.annotator === annotator) {
      throw new Error("Reviewer cannot be the same as annotator");
    }

    const res = await Task.findOneAndUpdate(
      { _id },
      {
        $set: { reviewer: annotator },
      },
      {
        new: true,
      }
    );
    return JSON.stringify(res);
  }

  // If assigning an annotator (default case)
  // First check if the annotator is not the same as current reviewer
  const existingTask = await Task.findById(_id);
  if (existingTask && existingTask.reviewer === annotator) {
    throw new Error("Annotator cannot be the same as reviewer");
  }

  // If annotator is being unassigned (empty string)
  if (!annotator) {
    const res = await Task.findOneAndUpdate(
      { _id },
      {
        $set: {
          annotator: null,
          ai: null,
        },
      },
      {
        new: true,
      }
    );
    return JSON.stringify(res);
  }

  const res = await Task.findOneAndUpdate(
    { _id },
    {
      $set: {
        annotator,
        ai: null,
      },
    },
    {
      new: true,
    }
  );
  if(res){
    sendNotificationEmail(res._id,'assigned')
    console.log("Email sent")
  }
  return JSON.stringify(res);
}

export async function getTasksByProject(id: string) {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const annotatorId = session?.user.id;

  const res = await Task.find({ annotator: annotatorId, project: id });
  return JSON.stringify(res);
}

export async function getTasksOfAnnotator() {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const annotatorId = session?.user.id;

  const res = await Task.find({ annotator: annotatorId });
  return JSON.stringify(res);
}

export async function getTask(_id: string) {
  await connectToDatabase();
  const res = await Task.findById(_id);
  return JSON.stringify(res);
}


export async function setTaskStatus(
  _id: string,
  status: string,
  feedback?: string,
  annotator?: string
) {
  await connectToDatabase();

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    throw new Error("Invalid Task ID format.");
  }

  const task = await Task.findById(_id);
  if (!task) {
    throw new Error("Task not found.");
  }

  switch (status) {
    case "reassigned": {
      const res = await Task.findOneAndUpdate(
        { _id },
        {
          submitted: false,
          status,
          timeTaken: 0,
          feedback: "",
          annotator,
          ai: null,
        },
        { new: true }
      );
      return res.status;
    }

    case "rejected": {
      const res = await Task.findOneAndUpdate(
        { _id },
        {
          submitted: false,
          status,
          timeTaken: 0,
          feedback,
          ai: null,
        },
        { new: true }
      );

      await Rework.create({
        name: res.name,
        created_at: res.created_at,
        project: res.project,
        project_Manager: res.project_Manager,
        annotator: res.annotator,
        reviewer: userId, 
        task: res._id,
        feedback: res.feedback,
      });

      return res.status;
    }

    default: {
      const sanitizedAI = typeof annotator === "string" ? annotator : null;

      const res = await Task.findOneAndUpdate(
        { _id },
        {
          status,
          feedback: "",
          ...(status === "reassigned" && {
            submitted: false,
            timeTaken: 0,
            annotator,
            ai: sanitizedAI,
          }),
        },
        { new: true }
      );

      return res.status;
    }
  }
}


export async function sendNotificationEmail(taskId: string, action: string) {
  try {

    const task = await Task.findById(taskId).populate("project annotator").exec();

    if (!task) {
      throw new Error("Task not found");
    }

    const projectId = task.project._id;
    const annotator = await User.findById(task.annotator).exec();

    if (!annotator || !annotator.email) {
      throw new Error("Annotator email not found");
    }

    // Fetch notification templates for the project


    const response = await getNotificationTemplatesByProject(projectId);
    const { templates } = response;

    if (!response.success || !templates) {
      throw new Error("Failed to fetch notification templates.");
    }

    const triggerTemplate = templates.find(
      (template: any) =>
        template.triggerName === action && template.active
    );

    if (triggerTemplate) {
      // Send an email using Nodemailer
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: annotator.email,
        subject: `Task ${action} Notification`,
        html: triggerTemplate.triggerBody, // Use the trigger body as the email content
      };

      await transporter.sendMail(mailOptions);

      console.log(`Notification email sent to ${annotator.email} for task ${action}`);
    } else {
      console.warn(`No active template found for the ${action} trigger.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in sending notification email: ${error.message}`);
    } else {
      console.error("Error in sending notification email:", error);
    }
    throw error;
  }
}

export async function sendCustomNotificationEmail(userIds: string[], projectId: string) {
  try {
    // Fetch notification templates for the project
    const response = await getNotificationTemplatesByProject(projectId);
    const { templates } = response;

    if (!response.success || !templates) {
      throw new Error("Failed to fetch notification templates.");
    }

    // Find the trigger template based on the custom action (since it's always 'custom' now)
    const triggerTemplate = templates.find(
      (template: any) =>
        template.triggerName === "custom" && template.active
    );

    if (!triggerTemplate) {
      throw new Error("No active template found for the 'custom' trigger.");
    }

    // Fetch the users (annotators) by their IDs
    const users = await User.find({ '_id': { $in: userIds } }).exec();
    if (!users || users.length === 0) {
      throw new Error("No users found with the provided IDs.");
    }

    // Create a transport using Nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Send the email to each user
    for (const user of users) {
      if (user.email) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: `Custom Email`,
          html: triggerTemplate.triggerBody, // Use the trigger body as the email content
        };

        await transporter.sendMail(mailOptions);
        console.log(`Notification email sent to ${user.email}`);
      } else {
        console.warn(`No email found for user ${user._id}`);
      }
    }

    console.log(`Notification emails sent successfully to all users`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in sending notification email: ${error.message}`);
    } else {
      console.error("Error in sending notification email:", error);
    }
    throw error;
  }
}


export async function getNotificationTemplatesByProject(projectId: string) {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const userId = session?.user.id;

  if (!userId || !session) {
    throw new Error("Unauthorized");
  }
  try {

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    const templates = await NotificationTemplate.find({ project: projectId });

    return {
      success: true,
      templates,
    };
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    return {
      success: false,
      error: 'Failed to fetch templates',
    };
  }
}



export async function getDistinctProjectsByAnnotator() {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const annotatorId = session?.user.id;

  try {
    const uniqueProjects = await Task.aggregate([
      { $match: { annotator: new mongoose.Types.ObjectId(annotatorId) } },
      { $group: { _id: "$project" } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "projectDetails",
        },
      },
      { $unwind: "$projectDetails" },
      { $project: { _id: 0, project: "$projectDetails" } },
    ]);
    const pro = uniqueProjects.map((project) => project.project);

    return JSON.stringify(pro);
  } catch (error) {
    console.error("Error fetching distinct projects by annotator:", error);
    throw error;
  }
}

export async function getTasksToReview() {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const reviewerId = session?.user.id;

  if (!reviewerId) {
    throw new Error("Unauthorized");
  }

  try {
    // Find tasks where:
    // 1. The user is assigned as reviewer
    // 2. Task status is any valid review status
    // 3. Include both submitted and unsubmitted tasks for better visibility
    const res = await Task.find({
      reviewer: reviewerId,
      // Include tasks that need review or are in review process
      status: {
        $in: ["pending", "accepted", "rejected", "reassigned"],
      },
    })
      .populate([
        {
          path: "project",
          select: "name",
        },
        {
          path: "annotator",
          select: "name email",
        },
      ])
      .sort({
        // Sort by submission status first (submitted tasks first)
        submitted: -1,
        // Then by status (pending first)
        status: 1,
        // Then by creation date (newest first)
        created_at: -1,
      });

    return JSON.stringify(res);
  } catch (error) {
    console.error("Error in getTasksToReview:", error);
    throw new Error("Failed to fetch review tasks");
  }
}

export async function getDistinctProjectsByReviewer() {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const reviewerId = session?.user.id;

  try {
    const uniqueProjects = await Task.aggregate([
      { $match: { reviewer: new mongoose.Types.ObjectId(reviewerId) } },
      { $group: { _id: "$project" } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "projectDetails",
        },
      },
      { $unwind: "$projectDetails" },
      { $project: { _id: 0, project: "$projectDetails" } },
    ]);

    return JSON.stringify(uniqueProjects.map((project) => project.project));
  } catch (error) {
    console.error("Error fetching distinct projects by reviewer:", error);
    throw error;
  }
}

export async function assignReviewer(_id: string, reviewerId: string | null) {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const userId = session?.user.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Find the task to ensure it belongs to the user's project
  const existingTask = await Task.findById(_id);

  if (!existingTask) {
    throw new Error("Task not found");
  }

  // Perform the update
  const res = await Task.findOneAndUpdate(
    { _id },
    {
      reviewer: reviewerId,
      // Ensure AI is set to null when assigning a reviewer
      ai: null,
    },
    {
      new: true,
    }
  );

  return JSON.stringify(res);
}
