const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const Subject = require("../../models/Subject");
const sharp = require("sharp");
const mongoose = require('mongoose');
const Quiz = require("../../models/Quiz");
const QuizSubmission = require("../../models/QuizSubmission");
const UserSubjectPriority = require("../../models/UserSubjectPriority");

const createSubject = async (req, res) => {
  try {
    const { name } = req.body;
    const imageFile = req.files?.image;

    if (!name || !imageFile) {
      return res.status(400).json({ error: "Name and image are required" });
    }

    // Read buffer from uploaded file
    const buffer = Buffer.from(imageFile.data, "binary");

    // 🔹 Resize + compress before upload
    const optimizedBuffer = await sharp(buffer)
      .resize({ width: 600 })        // fix width, auto height
      .jpeg({ quality: 75 })         // compress to 75%
      .toBuffer();

    // Ab helper ke liye ek "fake file object" banao jisme optimized buffer ho
    const optimizedFile = {
      name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"), // png -> jpg
      data: optimizedBuffer,
      mimetype: "image/jpeg"
    };

    // Upload image to S3
    const uploadedUrl = await upload_files("subjects", optimizedFile);
    if (!uploadedUrl) {
      return res.status(500).json({ error: "Image upload failed" });
    }

    // Save subject in DB
    const subject = await Subject.create({
      name,
      image: uploadedUrl,
    });

    res.json(subject);
  } catch (error) {
    console.error("Error adding subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// perfect working
const getAllSubjects = async (req, res) => {
  try {
    const { search, grade, userId } = req.query;

    const pipeline = [];

    // 🔎 Search filter
    if (search) {
      pipeline.push({
        $match: {
          name: { $regex: search, $options: "i" }
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "concepts",
          localField: "_id",
          foreignField: "subjectId",
          as: "concepts"
        }
      },
      {
        $addFields: {
          conceptIds: {
            $map: { input: "$concepts", as: "c", in: "$$c._id" }
          }
        }
      },
      {
        $lookup: {
          from: "comics",
          let: { cids: "$conceptIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$conceptId", "$$cids"] },
                    { $eq: ["$status", "approved"] }
                  ]
                }
              }
            },
            { $group: { _id: "$conceptId" } }
          ],
          as: "approvedConcepts"
        }
      },
      {
        $addFields: {
          conceptCount: { $size: "$approvedConcepts" }
        }
      },
      {
        $project: {
          concepts: 0,
          conceptIds: 0,
          approvedConcepts: 0
        }
      }
    );

    let subjects = await Subject.aggregate(pipeline);

    // 🔥 Grade filter apply
    if (grade) {
      const gradeNum = parseInt(grade, 10);

      subjects = subjects.filter((s) => {
        // name me "Grades 6–12" type ka text nikalna hai
        const match = s.name.match(/Grades?\s*(\d+)(?:–(\d+))?/);

        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : start;

          return gradeNum >= start && gradeNum <= end;
        }

        return false; // agar grade mention hi nahi hai to exclude
      });
    }


   
    // 🔥 Global rule: Empty concept list wale subjects ko exclude karo
    subjects = subjects.filter((s) => s.conceptCount >= 1);


    let prioritySubjects = [];
    let remainingSubjects = subjects;

    if (userId) {
      const pref = await UserSubjectPriority.findOne({ userId });

      if (pref?.selectedSubjects?.length > 0) {
        const selectedIds = pref.selectedSubjects.map((id) => id.toString());

        // Pehle user ke selected subjects
        prioritySubjects = selectedIds
          .map((id) => subjects.find((s) => s._id.toString() === id))
          .filter(Boolean);

        // Fir baki subjects
        remainingSubjects = subjects.filter(
          (s) => !selectedIds.includes(s._id.toString())
        );
      }
    }

    // ✅ Sabse latest subject nikal lo
    let latest = null;
    if (subjects.length > 0) {
      latest = subjects.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
      );
    }

    // ✅ Agar latest already priority me nahi hai, to usse priority ke niche insert karo
    let finalSubjects = [...prioritySubjects];
    if (latest && !prioritySubjects.find((s) => s._id.toString() === latest._id.toString())) {
      finalSubjects.push(latest);
      remainingSubjects = remainingSubjects.filter(
        (s) => s._id.toString() !== latest._id.toString()
      );
    }

    // ✅ Baaki subjects append kar do
    finalSubjects = [...finalSubjects, ...remainingSubjects];

    res.json(finalSubjects);
  } catch (err) {
    console.error("Error fetching subjects with counts:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
};




const deleteSubject = async (req, res) => {
  try {
    const { id } = req.body;

    // Subject find karo
    const subject = await Subject.findById(id);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // Agar image hai toh S3 se delete karo
    if (subject.image) {
      try {
        // S3 me se sirf fileName nikalna hoga (path ke last part)
        const imageUrl = subject.image;
        const fileName = imageUrl.split("/").pop(); // last part after '/'

        await deleteFiles("subjects", fileName);
      } catch (err) {
        console.warn("S3 delete failed:", err);
      }
    }

    // Subject ko DB se delete karo
    await Subject.findByIdAndDelete(id);

    res.json({ success: true, message: "Subject deleted successfully" });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};



// const getConceptsBySubject = async (req, res) => {
//   try {
//     const subjectId = req.params.subjectId;

//     // Subject validate
//     const subject = await Subject.findById(subjectId);
//     if (!subject) {
//       return res.status(404).json({ error: "Subject not found" });
//     }

//     const result = await Comic.aggregate([
//       {
//         $match: {
//           status: "approved",
//           subjectId: new mongoose.Types.ObjectId(subjectId),
//         },
//       },

//       {
//         $group: {
//           _id: "$conceptId",
//           comicCount: { $sum: 1 },
//         },
//       },

//       {
//         $lookup: {
//           from: "concepts",
//           localField: "_id",
//           foreignField: "_id",
//           as: "conceptData",
//         },
//       },
//       { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

//       {
//         $project: {
//           _id: 0,
//           conceptId: "$conceptData._id",
//           name: "$conceptData.name",
//           comicCount: 1,
//         },
//       },
//     ]);

//     res.json({
//       subject: subject.name,
//       concepts: result,
//     });
//   } catch (error) {
//     console.error("Error fetching concepts:", error);
//     res.status(500).json({ error: "Failed to fetch concepts" });
//   }
// };

const getConceptsBySubject = async (req, res) => {
  try {
    const subjectId = req.params.subjectId;

    // Subject validate
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const result = await Comic.aggregate([
      {
        $match: {
          status: "approved",
          subjectId: new mongoose.Types.ObjectId(subjectId),
        },
      },

      {
        $group: {
          _id: { conceptId: "$conceptId", themeId: "$themeId" },
          comicCount: { $sum: 1 },
        },
      },

      // 🔍 concept join
      {
        $lookup: {
          from: "concepts",
          localField: "_id.conceptId",
          foreignField: "_id",
          as: "conceptData",
        },
      },
      { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

      // 🔍 theme join
      {
        $lookup: {
          from: "themes",
          localField: "_id.themeId",
          foreignField: "_id",
          as: "themeData",
        },
      },
      { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 0,
          conceptId: "$conceptData._id",
          conceptName: "$conceptData.name",
          themeId: "$themeData._id",
          themeName: "$themeData.name",
          comicCount: 1,
        },
      },
    ]);

    res.json({
      subject: subject.name,
      concepts: result,
    });
  } catch (error) {
    console.error("Error fetching concepts:", error);
    res.status(500).json({ error: "Failed to fetch concepts" });
  }
};


// perfect working by grouping
// const getComicsByConcept = async (req, res) => {
//   try {
//     const conceptId = req.params.conceptId;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const userId = req.query.userId; // 👈 user identify

//     let comics = await Comic.aggregate([
//       {
//         $match: {
//           status: "approved",
//           conceptId: new mongoose.Types.ObjectId(conceptId),
//         },
//       },
//       { $sort: { partNumber: 1 } }, // har series ke andar part number ka order
//       { $skip: skip },
//       { $limit: limit },

//       {
//         $lookup: {
//           from: "faqs",
//           localField: "_id",
//           foreignField: "comicId",
//           as: "faqs",
//         },
//       },
//       {
//         $lookup: {
//           from: "subjects",
//           localField: "subjectId",
//           foreignField: "_id",
//           as: "subjectData",
//         },
//       },
//       { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },

//       {
//         $lookup: {
//           from: "themes", // 👈 new lookup
//           localField: "themeId",
//           foreignField: "_id",
//           as: "themeData",
//         },
//       },
//       { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: "didyouknows",
//           localField: "_id",
//           foreignField: "comicId",
//           as: "facts",
//         },
//       },
//       {
//         $lookup: {
//           from: "comicpages",
//           localField: "_id",
//           foreignField: "comicId",
//           as: "pages",
//         },
//       },
//       {
//         $addFields: {
//           hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
//           hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
//           thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },
//           subjectId: "$subjectData._id",
//           subject: "$subjectData.name",
//           themeId: "$themeData._id",        // 👈 already have themeId
//           theme: "$themeData.name",
//         },
//       },
//       {
//         $project: {
//           faqs: 0,
//           facts: 0,
//           pages: 0,
//           subjectData: 0,
//           prompt: 0,
//           themeData: 0,
//         },
//       },
//     ]);

//     // ✅ hasAttempted check
//     if (userId) {
//       const comicIds = comics.map((c) => c._id);

//       // quizzes nikal lo for these comics
//       const quizzes = await Quiz.find(
//         { comicId: { $in: comicIds } },
//         "_id comicId"
//       );

//       const submissions = await QuizSubmission.find(
//         {
//           quizId: { $in: quizzes.map((q) => q._id) },
//           userId: new mongoose.Types.ObjectId(userId),
//         },
//         "quizId"
//       );

//       const attemptedQuizIds = new Set(
//         submissions.map((s) => s.quizId.toString())
//       );

//       comics.forEach((comic) => {
//         const quiz = quizzes.find(
//           (q) => q.comicId.toString() === comic._id.toString()
//         );
//         comic.hasAttempted = quiz
//           ? attemptedQuizIds.has(quiz._id.toString())
//           : false;
//       });
//     } else {
//       comics.forEach((comic) => (comic.hasAttempted = false));
//     }

//     // ✅ isOpen logic series-wise
//     comics = comics.sort((a, b) => {
//       if (a.seriesId.toString() === b.seriesId.toString()) {
//         return a.partNumber - b.partNumber; // same series → part order
//       }
//       return a.seriesId.toString().localeCompare(b.seriesId.toString()); // series wise group
//     });

//     // series wise group banao
//     const seriesGroups = {};
//     comics.forEach((comic) => {
//       const seriesKey = comic.seriesId.toString();
//       if (!seriesGroups[seriesKey]) {
//         seriesGroups[seriesKey] = [];
//       }
//       seriesGroups[seriesKey].push(comic);
//     });

//     // har series me sequential isOpen apply karo
//     Object.values(seriesGroups).forEach((seriesComics) => {
//       seriesComics.sort((a, b) => a.partNumber - b.partNumber);
//       seriesComics.forEach((comic) => {
//         if (comic.partNumber === 1) {
//           comic.isOpen = true; // Part 1 hamesha open
//         } else {
//           const prevComic = seriesComics.find(
//             (c) => c.partNumber === comic.partNumber - 1
//           );
//           comic.isOpen = prevComic && prevComic.hasAttempted ? true : false;
//         }
//       });
//     });

//     const totalComics = await Comic.countDocuments({
//       status: "approved",
//       conceptId: new mongoose.Types.ObjectId(conceptId),
//     });

//     res.json({
//       conceptId,
//       page,
//       limit,
//       totalPages: Math.ceil(totalComics / limit),
//       totalComics,
//       comics,
//     });
//   } catch (error) {
//     console.error("Error fetching comics by concept:", error);
//     res.status(500).json({ error: "Failed to fetch comics" });
//   }
// };


const getComicsByConcept = async (req, res) => {
  try {
    const conceptId = req.params.conceptId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.query.userId; // 👈 user identify

    let comics = await Comic.aggregate([
      {
        $match: {
          status: "approved",
          conceptId: new mongoose.Types.ObjectId(conceptId),
        },
      },
      { $sort: { partNumber: 1 } }, // har series ke andar part number ka order
      { $skip: skip },
      { $limit: limit },

      {
        $lookup: {
          from: "faqs",
          localField: "_id",
          foreignField: "comicId",
          as: "faqs",
        },
      },
      {
        $lookup: {
          from: "subjects",
          localField: "subjectId",
          foreignField: "_id",
          as: "subjectData",
        },
      },
      { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "themes", // 👈 new lookup
          localField: "themeId",
          foreignField: "_id",
          as: "themeData",
        },
      },
      { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "didyouknows",
          localField: "_id",
          foreignField: "comicId",
          as: "facts",
        },
      },
      {
        $lookup: {
          from: "comicpages",
          localField: "_id",
          foreignField: "comicId",
          as: "pages",
        },
      },
      {
        $addFields: {
          hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
          hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
          thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },
          subjectId: "$subjectData._id",
          subject: "$subjectData.name",
          themeId: "$themeData._id",        // 👈 already have themeId
          theme: "$themeData.name",
        },
      },
      {
        $project: {
          faqs: 0,
          facts: 0,
          pages: 0,
          subjectData: 0,
          prompt: 0,
          themeData: 0,
        },
      },
    ]);

    // ✅ hasAttempted check
    if (userId) {
      const comicIds = comics.map((c) => c._id);

      // quizzes nikal lo for these comics
      const quizzes = await Quiz.find(
        { comicId: { $in: comicIds } },
        "_id comicId"
      );

      const submissions = await QuizSubmission.find(
        {
          quizId: { $in: quizzes.map((q) => q._id) },
          userId: new mongoose.Types.ObjectId(userId),
        },
        "quizId"
      );

      const attemptedQuizIds = new Set(
        submissions.map((s) => s.quizId.toString())
      );

      comics.forEach((comic) => {
        const quiz = quizzes.find(
          (q) => q.comicId.toString() === comic._id.toString()
        );
        comic.hasAttempted = quiz
          ? attemptedQuizIds.has(quiz._id.toString())
          : false;
      });
    } else {
      comics.forEach((comic) => (comic.hasAttempted = false));
    }

    // ✅ isOpen logic series-wise
    comics = comics.sort((a, b) => {
      const aSeries = a.seriesId ? a.seriesId.toString() : "";
      const bSeries = b.seriesId ? b.seriesId.toString() : "";

      if (aSeries === bSeries) {
        return a.partNumber - b.partNumber; // same series → part order
      }
      return aSeries.localeCompare(bSeries); // series wise group
    });

    // series wise group banao
    const seriesGroups = {};
    comics.forEach((comic) => {
      const seriesKey = comic.seriesId ? comic.seriesId.toString() : "no-series";
      if (!seriesGroups[seriesKey]) {
        seriesGroups[seriesKey] = [];
      }
      seriesGroups[seriesKey].push(comic);
    });

    // har series me sequential isOpen apply karo
    Object.values(seriesGroups).forEach((seriesComics) => {
      seriesComics.sort((a, b) => a.partNumber - b.partNumber);

      if (seriesComics.length === 1) {
        // 👈 only one comic in this series → always open
        seriesComics[0].isOpen = true;
      } else {
        seriesComics.forEach((comic) => {
          if (comic.partNumber === 1) {
            comic.isOpen = true; // Part 1 hamesha open
          } else {
            const prevComic = seriesComics.find(
              (c) => c.partNumber === comic.partNumber - 1
            );
            comic.isOpen = prevComic && prevComic.hasAttempted ? true : false;
          }
        });
      }
    });



    const totalComics = await Comic.countDocuments({
      status: "approved",
      conceptId: new mongoose.Types.ObjectId(conceptId),
    });

    res.json({
      conceptId,
      page,
      limit,
      totalPages: Math.ceil(totalComics / limit),
      totalComics,
      comics,
    });
  } catch (error) {
    console.error("Error fetching comics by concept:", error);
    res.status(500).json({ error: "Failed to fetch comics" });
  }
};




// Save or update user subject priority
const saveSubjectPriority = async (req, res) => {
  try {
    const userId = req.body.userId;

    const { selectedSubjects } = req.body;

    if (!userId || !selectedSubjects || !Array.isArray(selectedSubjects)) {
      return res.status(400).json({ error: "userId and selectedSubjects[] required" });
    }

    // Save or update
    const priority = await UserSubjectPriority.findOneAndUpdate(
      { userId },
      { selectedSubjects },
      { upsert: true, new: true }
    );

    res.json({ success: true, priority });
  } catch (error) {
    console.error("Error saving subject priority:", error);
    res.status(500).json({ error: "Failed to save subject priority" });
  }
};




module.exports = { createSubject, getAllSubjects, deleteSubject, getConceptsBySubject, getComicsByConcept, saveSubjectPriority };
